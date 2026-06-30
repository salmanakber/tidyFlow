import prisma from '@/lib/prisma';
import { getAIConfig, isAIEnabled } from './config';
import { aiChat, parseJSONResponse } from './client';
import {
  recommendCleanersForTask,
  recommendCleanersForProperty,
  type AssignmentRecommendations,
} from './assignment-recommendations';

export interface SupplySuggestion {
  supplyItemId: number;
  name: string;
  unit: string;
  currentStock: number;
  quantity: string;
  suggestedQuantity: number;
  reason: string;
}

export interface TaskSuggestions {
  propertySummary: string;
  estimatedMinutes: number | null;
  checklist: string[];
  supplies: SupplySuggestion[];
  cleaners: AssignmentRecommendations;
  cleaningScore: number | null;
  photoCount: number;
  aiGenerated: boolean;
}

type CompanySupply = {
  id: number;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
};

const DEFAULT_CHECKLIST_BY_TYPE: Record<string, string[]> = {
  residential: [
    'Kitchen surfaces and appliances',
    'Bathrooms sanitized',
    'Floors vacuumed and mopped',
    'Bins emptied',
    'Final walkthrough',
  ],
  commercial: [
    'Reception and common areas',
    'Restrooms stocked and cleaned',
    'Floor care',
    'Desks and touchpoints',
    'Waste removal',
  ],
  office: [
    'Desks and workstations',
    'Meeting rooms',
    'Kitchen/break area',
    'Restrooms',
    'Floors and glass',
  ],
};

function propertyTypeKey(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('office') || t.includes('commercial')) return 'office';
  if (t.includes('commercial')) return 'commercial';
  return 'residential';
}

function buildRuleBasedChecklist(
  propertyType: string,
  pastTitles: string[]
): string[] {
  const base = DEFAULT_CHECKLIST_BY_TYPE[propertyTypeKey(propertyType)] || DEFAULT_CHECKLIST_BY_TYPE.residential;
  const fromHistory = pastTitles.slice(0, 8);
  const merged = [...new Set([...fromHistory, ...base])];
  return merged.slice(0, 12);
}

/** Only in-stock company inventory (currentStock > 0). */
function buildSuppliesFromStock(inventory: CompanySupply[]): SupplySuggestion[] {
  const inStock = inventory.filter((s) => s.currentStock > 0);
  if (inStock.length === 0) return [];

  const sorted = [...inStock].sort((a, b) => {
    const aLow = a.currentStock <= a.minStock ? 0 : 1;
    const bLow = b.currentStock <= b.minStock ? 0 : 1;
    if (aLow !== bLow) return aLow - bLow;
    return b.currentStock - a.currentStock;
  });

  return sorted.slice(0, 8).map((item) => {
    const qty = Math.min(Math.max(1, Math.ceil(item.minStock / 2)), item.currentStock);
    return {
      supplyItemId: item.id,
      name: item.name,
      unit: item.unit,
      currentStock: item.currentStock,
      suggestedQuantity: qty,
      quantity: `${qty} ${item.unit}`,
      reason:
        item.currentStock <= item.minStock
          ? 'Low stock — take only what you need'
          : 'Available in company stock',
    };
  });
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

/** Map AI output to real inventory rows — never invent items. */
function filterSuppliesToInventory(
  raw: Array<{ name?: string; quantity?: string; reason?: string }>,
  inventory: CompanySupply[]
): SupplySuggestion[] {
  const inStock = inventory.filter((s) => s.currentStock > 0);
  const byName = new Map(inStock.map((s) => [normalizeName(s.name), s]));
  const used = new Set<number>();
  const results: SupplySuggestion[] = [];

  for (const entry of raw) {
    if (!entry.name) continue;
    const match = byName.get(normalizeName(entry.name));
    if (!match || used.has(match.id)) continue;
    used.add(match.id);

    const parsedQty = parseInt(String(entry.quantity || '1'), 10);
    const qty = Number.isNaN(parsedQty)
      ? 1
      : Math.min(Math.max(1, parsedQty), match.currentStock);

    results.push({
      supplyItemId: match.id,
      name: match.name,
      unit: match.unit,
      currentStock: match.currentStock,
      suggestedQuantity: qty,
      quantity: `${qty} ${match.unit}`,
      reason: entry.reason || 'Suggested for this job',
    });
  }

  return results.slice(0, 8);
}

export async function generateTaskSuggestions(input: {
  companyId: number;
  taskId?: number;
  propertyId?: number;
  title?: string;
  description?: string;
  scheduledDate?: Date;
  locale?: string | null;
}): Promise<TaskSuggestions | null> {
  const { companyId, taskId, propertyId, title, description, scheduledDate, locale } = input;

  let propertyIdResolved = propertyId;
  let task: {
    id: number;
    title: string;
    description: string | null;
    propertyId: number;
    scheduledDate: Date | null;
    property: {
      id: number;
      address: string;
      propertyType: string;
      unitCount: number;
      notes: string | null;
    };
    photos: Array<{ photoType: string; aiPhotoScore: { score: number } | null }>;
    checklists: Array<{ title: string }>;
  } | null = null;

  if (taskId) {
    task = await prisma.task.findFirst({
      where: { id: taskId, companyId },
      include: {
        property: {
          select: {
            id: true,
            address: true,
            propertyType: true,
            unitCount: true,
            notes: true,
          },
        },
        photos: {
          select: {
            photoType: true,
            aiPhotoScore: { select: { score: true } },
          },
        },
        checklists: { select: { title: true }, take: 20 },
      },
    });
    if (!task) return null;
    propertyIdResolved = task.propertyId;
  }

  if (!propertyIdResolved) return null;

  const property =
    task?.property ||
    (await prisma.property.findFirst({
      where: { id: propertyIdResolved, companyId },
      select: {
        id: true,
        address: true,
        propertyType: true,
        unitCount: true,
        notes: true,
      },
    }));

  if (!property) return null;

  const [pastTasks, supplyItems, cleaners] = await Promise.all([
    prisma.task.findMany({
      where: {
        companyId,
        propertyId: property.id,
        status: { in: ['COMPLETED', 'APPROVED', 'SUBMITTED'] },
        ...(taskId ? { id: { not: taskId } } : {}),
      },
      orderBy: { completedAt: 'desc' },
      take: 5,
      include: {
        checklists: { select: { title: true }, take: 15 },
      },
    }),
    prisma.supplyItem.findMany({
      where: { companyId, isActive: true, currentStock: { gt: 0 } },
      select: { id: true, name: true, unit: true, currentStock: true, minStock: true },
      orderBy: { name: 'asc' },
    }),
    taskId
      ? recommendCleanersForTask(taskId, companyId, undefined, undefined, locale)
      : recommendCleanersForProperty(property.id, companyId, scheduledDate, undefined, undefined, locale),
  ]);

  const pastChecklistTitles = pastTasks.flatMap((t) => t.checklists.map((c) => c.title));
  let checklist = buildRuleBasedChecklist(property.propertyType, pastChecklistTitles);
  let supplies = buildSuppliesFromStock(supplyItems);

  const scoredPhotos = (task?.photos || [])
    .map((p) => p.aiPhotoScore?.score)
    .filter((s): s is number => typeof s === 'number');
  const cleaningScore =
    scoredPhotos.length > 0
      ? Math.round(scoredPhotos.reduce((a, b) => a + b, 0) / scoredPhotos.length)
      : null;

  let propertySummary = `${property.propertyType} at ${property.address}.`;
  if (property.unitCount > 1) propertySummary += ` ${property.unitCount} units.`;
  if (property.notes) propertySummary += ` Notes: ${property.notes.slice(0, 120)}.`;
  if (cleaningScore != null) propertySummary += ` Current AI cleaning score: ${cleaningScore}/100.`;
  if (supplyItems.length === 0) {
    propertySummary += ' No supplies in stock — add inventory in the mobile app.';
  }

  let estimatedMinutes: number | null = null;
  let aiGenerated = false;

  const inventoryForPrompt = supplyItems.map((s) => ({
    id: s.id,
    name: s.name,
    unit: s.unit,
    inStock: s.currentStock,
  }));

  const config = await getAIConfig();
  if (isAIEnabled(config) && supplyItems.length > 0) {
    try {
      const prompt = `You are TidyFlow AI for a professional cleaning platform.
Analyze this job and respond ONLY with valid JSON:
{
  "propertySummary": "<2 sentences about the property and job context>",
  "estimatedMinutes": <number or null>,
  "checklist": ["<specific checklist items>"],
  "supplies": [{"name":"<exact name from inventory>","quantity":"<number only>","reason":"<why>"}]
}

IMPORTANT: For supplies you MUST ONLY pick items from this company inventory list (exact names). Never invent items.
Company inventory (in stock only): ${JSON.stringify(inventoryForPrompt)}

Property: ${property.address} (${property.propertyType})
Units: ${property.unitCount}
${property.notes ? `Notes: ${property.notes.slice(0, 200)}` : ''}
Task title: ${title || task?.title || 'Cleaning task'}
Description: ${description || task?.description || 'Standard clean'}
Past checklist items at this property: ${JSON.stringify(pastChecklistTitles.slice(0, 10))}
${cleaningScore != null ? `Existing photo QA score: ${cleaningScore}/100` : ''}

Checklist 6–10 items. Supplies: pick 3–6 items from inventory only. Quantity must not exceed inStock.`;

      const aiResult = await aiChat(
        [
          { role: 'system', content: 'TidyFlow task planning assistant. JSON only. Supplies must match inventory exactly.' },
          { role: 'user', content: prompt },
        ],
        { companyId, jsonMode: true, locale }
      );

      const parsed = parseJSONResponse<{
        propertySummary?: string;
        estimatedMinutes?: number | null;
        checklist?: string[];
        supplies?: Array<{ name?: string; quantity?: string; reason?: string }>;
      }>(aiResult.text);

      if (parsed.propertySummary) propertySummary = parsed.propertySummary;
      if (parsed.estimatedMinutes != null) estimatedMinutes = parsed.estimatedMinutes;
      if (parsed.checklist?.length) checklist = parsed.checklist.slice(0, 12);
      if (parsed.supplies?.length) {
        const filtered = filterSuppliesToInventory(parsed.supplies, supplyItems);
        if (filtered.length > 0) supplies = filtered;
      }
      aiGenerated = true;
    } catch (error) {
      console.warn('AI task suggestions fallback to rules:', error);
    }
  }

  if (task?.checklists.length && !aiGenerated) {
    const existing = task.checklists.map((c) => c.title);
    checklist = [...new Set([...existing, ...checklist])].slice(0, 12);
  }

  return {
    propertySummary,
    estimatedMinutes,
    checklist,
    supplies,
    cleaners,
    cleaningScore,
    photoCount: task?.photos.length ?? 0,
    aiGenerated,
  };
}

/** Rule-based checklist suggestions from property type and past jobs (no AI quota). */
export async function getChecklistSuggestionsForTask(
  companyId: number,
  taskId: number
): Promise<string[]> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, companyId },
    include: {
      property: {
        select: { id: true, propertyType: true, address: true, unitCount: true, notes: true },
      },
      checklists: { select: { title: true } },
    },
  });

  if (!task?.property) return [];

  const pastTasks = await prisma.task.findMany({
    where: {
      companyId,
      propertyId: task.property.id,
      status: { in: ['COMPLETED', 'APPROVED', 'SUBMITTED'] },
      id: { not: taskId },
    },
    orderBy: { completedAt: 'desc' },
    take: 5,
    include: {
      checklists: { select: { title: true }, take: 15 },
    },
  });

  const pastChecklistTitles = pastTasks.flatMap((t) => t.checklists.map((c) => c.title));
  const suggestions = buildRuleBasedChecklist(task.property.propertyType, pastChecklistTitles);

  const existing = new Set(
    task.checklists.map((c) => c.title.trim().toLowerCase()).filter(Boolean)
  );

  return suggestions.filter((s) => !existing.has(s.trim().toLowerCase()));
}
