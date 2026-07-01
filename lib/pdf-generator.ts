import { Task, Photo, Note, ChecklistItem, Property, User } from '@prisma/client';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export interface PDFTaskData extends Task {
  property: Property | null;
  assignedUser: (User & { firstName: string | null; lastName: string | null; email: string }) | null;
  photos: Photo[];
  notes: Note[];
  checklists: ChecklistItem[];
}

export interface PDFGenerationResult {
  success: boolean;
  pdfUrl?: string;
  pdfBuffer?: Buffer;
  checksum?: string;
  error?: string;
  generatedAt: Date;
}

// ---------------------------------------------------------------------------
// TidyFlow brand palette — used across the task report PDF.
// Primary: deep navy · Secondary: deep amber
// ---------------------------------------------------------------------------
const COLORS = {
  navy: '#132A4C',
  navyDark: '#0B1A30',
  amber: '#D98324',
  amberDark: '#B5691A',
  amberLight: '#FBEBD9',
  textDark: '#1F2937',
  textMuted: '#6B7280',
  border: '#E2E5EA',
  bgLight: '#F7F8FA',
  white: '#FFFFFF',
  success: '#1E8E5A',
  successBg: '#DCF5E7',
  danger: '#C0392B',
  dangerBg: '#FBE2E0',
  infoBg: '#E2ECFB',
  infoText: '#2A5DAA',
};

export async function generateTaskPDF(
  task: PDFTaskData,
  pdfType: 'before' | 'after' | 'combined' = 'combined'
): Promise<PDFGenerationResult> {
  const startTime = Date.now();

  try {
    // Get photos (allow any number - no minimum requirement)
    const beforePhotos = task.photos.filter(p => p.photoType === 'before');
    const afterPhotos = task.photos.filter(p => p.photoType === 'after');
    
    // Filter photos based on pdfType
    let photosToInclude: Photo[] = [];
    let sectionTitle = '';
    
    if (pdfType === 'before') {
      photosToInclude = beforePhotos;
      sectionTitle = 'Before Photos';
      if (beforePhotos.length === 0) {
        return {
          success: false,
          error: `No before photos available for PDF generation`,
          generatedAt: new Date(),
        };
      }
    } else if (pdfType === 'after') {
      photosToInclude = afterPhotos;
      sectionTitle = 'After Photos';
      if (afterPhotos.length === 0) {
        return {
          success: false,
          error: `No after photos available for PDF generation`,
          generatedAt: new Date(),
        };
      }
    } else {
      // Combined - use all photos
      photosToInclude = task.photos;
      if (task.photos.length === 0) {
        return {
          success: false,
          error: `No photos available for PDF generation`,
          generatedAt: new Date(),
        };
      }
    }

    // Configure PDFKit font path for Next.js serverless compatibility
    // PDFKit needs access to font files, so we patch fs.readFileSync to redirect font file reads
    try {
      // Find the actual location of PDFKit font files
      const possiblePaths = [
        path.resolve(process.cwd(), 'node_modules/pdfkit/js/data'),
        path.resolve(__dirname, '../../node_modules/pdfkit/js/data'),
        path.resolve(__dirname, '../../../node_modules/pdfkit/js/data'),
      ];
      
      let actualFontPath: string | undefined;
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          actualFontPath = testPath;
          break;
        }
      }
      
      if (actualFontPath) {
        // Monkey-patch fs.readFileSync to redirect font file reads
        const originalReadFileSync = fs.readFileSync;
        fs.readFileSync = function(filePath: string | Buffer | URL, ...args: any[]) {
          const filePathStr = filePath.toString();
          // If PDFKit is trying to read a font file from a non-existent path, redirect it
          if (filePathStr.includes('Helvetica.afm') || filePathStr.includes('data/') && filePathStr.endsWith('.afm')) {
            const fileName = path.basename(filePathStr);
            const actualPath = path.join(actualFontPath, fileName);
            if (fs.existsSync(actualPath)) {
              return originalReadFileSync.call(this, actualPath, ...args);
            }
          }
          return originalReadFileSync.call(this, filePath, ...args);
        };
        
        // Restore original after PDF generation
        setTimeout(() => {
          fs.readFileSync = originalReadFileSync;
        }, 1000);
      } else {
        console.warn('PDFKit font path not found. Tried:', possiblePaths);
      }
    } catch (error) {
      console.warn('Could not configure PDFKit font path:', error);
    }

    // Helper function to normalize Cloudinary URL for PDF embedding
    const normalizeCloudinaryUrl = (url: string): string => {
      if (!url) return url;
      
      // Ensure HTTPS
      let normalizedUrl = url.replace(/^http:\/\//, 'https://');
      
      // If it's a Cloudinary URL, ensure it uses the proper format for image fetching
      // Cloudinary URLs should work as-is, but we can add transformations if needed
      if (normalizedUrl.includes('res.cloudinary.com')) {
        // Ensure we're using the image/upload endpoint (not video or raw)
        if (!normalizedUrl.includes('/image/upload/')) {
          // Try to fix the URL structure
          const cloudNameMatch = normalizedUrl.match(/res\.cloudinary\.com\/([^\/]+)\//);
          if (cloudNameMatch) {
            const cloudName = cloudNameMatch[1];
            const pathAfterCloudName = normalizedUrl.split(`res.cloudinary.com/${cloudName}/`)[1];
            if (pathAfterCloudName && !pathAfterCloudName.startsWith('image/upload/')) {
              normalizedUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${pathAfterCloudName}`;
            }
          }
        }
        
        // Add format transformation to ensure JPEG format for better PDF compatibility
        // Only if no format is already specified
        if (!normalizedUrl.includes('/f_') && !normalizedUrl.includes('/fl_')) {
          // Insert format transformation before the public ID
          const parts = normalizedUrl.split('/image/upload/');
          if (parts.length === 2) {
            const publicIdPart = parts[1];
            // Check if there are already transformations
            if (publicIdPart.includes(',')) {
              // Has transformations, add format
              normalizedUrl = `${parts[0]}/image/upload/f_jpg,${publicIdPart}`;
            } else {
              // No transformations, add format
              normalizedUrl = `${parts[0]}/image/upload/f_jpg/${publicIdPart}`;
            }
          }
        }
      }
      
      return normalizedUrl;
    };

    // Helper function to fetch image buffer from URL
    const fetchImageBuffer = async (url: string): Promise<Buffer | null> => {
      try {
        // Normalize the URL first
        const normalizedUrl = normalizeCloudinaryUrl(url);
        console.log(`Fetching image from: ${normalizedUrl}`);
        
        const response = await fetch(normalizedUrl, {
          headers: {
            'User-Agent': 'TidyFlow-PDF-Generator/1.0',
          },
        });
        
        if (!response.ok) {
          console.error(`Failed to fetch image from ${normalizedUrl}: ${response.status} ${response.statusText}`);
          // Try original URL if normalized fails
          if (normalizedUrl !== url) {
            console.log(`Retrying with original URL: ${url}`);
            const retryResponse = await fetch(url, {
              headers: {
                'User-Agent': 'TidyFlow-PDF-Generator/1.0',
              },
            });
            if (retryResponse.ok) {
              const arrayBuffer = await retryResponse.arrayBuffer();
              return Buffer.from(arrayBuffer);
            }
          }
          return null;
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.startsWith('image/')) {
          console.warn(`Unexpected content type for ${normalizedUrl}: ${contentType}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (error) {
        console.error(`Error fetching image from ${url}:`, error);
        return null;
      }
    };

    // Fetch images based on pdfType
    let photoBuffers: (Buffer | null)[] = [];
    if (pdfType === 'before') {
      photoBuffers = await Promise.all(
        photosToInclude.map(async (photo, index) => {
          const buffer = await fetchImageBuffer(photo.url);
          if (!buffer) {
            console.error(`Failed to fetch before photo ${index + 1} from URL: ${photo.url}`);
          }
          return buffer;
        })
      );
      console.log(`Fetched ${photoBuffers.filter(b => b !== null).length}/${photosToInclude.length} before photos`);
    } else if (pdfType === 'after') {
      photoBuffers = await Promise.all(
        photosToInclude.map(async (photo, index) => {
          const buffer = await fetchImageBuffer(photo.url);
          if (!buffer) {
            console.error(`Failed to fetch after photo ${index + 1} from URL: ${photo.url}`);
          }
          return buffer;
        })
      );
      console.log(`Fetched ${photoBuffers.filter(b => b !== null).length}/${photosToInclude.length} after photos`);
    } else {
      // Combined - fetch both separately
      const beforePhotoBuffers = await Promise.all(
        beforePhotos.map(async (photo, index) => {
          const buffer = await fetchImageBuffer(photo.url);
          if (!buffer) {
            console.error(`Failed to fetch before photo ${index + 1} from URL: ${photo.url}`);
          }
          return buffer;
        })
      );
      const afterPhotoBuffers = await Promise.all(
        afterPhotos.map(async (photo, index) => {
          const buffer = await fetchImageBuffer(photo.url);
          if (!buffer) {
            console.error(`Failed to fetch after photo ${index + 1} from URL: ${photo.url}`);
          }
          return buffer;
        })
      );
      const beforeSuccessCount = beforePhotoBuffers.filter(b => b !== null).length;
      const afterSuccessCount = afterPhotoBuffers.filter(b => b !== null).length;
      console.log(`Fetched ${beforeSuccessCount}/${beforePhotos.length} before photos and ${afterSuccessCount}/${afterPhotos.length} after photos`);
      
      // Store for combined PDF generation
      (photoBuffers as any).before = beforePhotoBuffers;
      (photoBuffers as any).after = afterPhotoBuffers;
    }

    // Generate actual PDF using PDFKit
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const margin = 50;
      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - margin * 2;

      // -----------------------------------------------------------------
      // Small design-system helpers
      // -----------------------------------------------------------------

      const getStatusColor = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s.includes('complet')) return { bg: COLORS.successBg, text: COLORS.success };
        if (s.includes('progress')) return { bg: COLORS.amberLight, text: COLORS.amberDark };
        if (s.includes('cancel')) return { bg: COLORS.dangerBg, text: COLORS.danger };
        return { bg: COLORS.bgLight, text: COLORS.textMuted };
      };

      const getSeverityColor = (severity: string | null) => {
        const s = (severity || '').toLowerCase();
        if (s === 'critical' || s === 'high') return { bg: COLORS.dangerBg, text: COLORS.danger };
        if (s === 'medium') return { bg: COLORS.amberLight, text: COLORS.amberDark };
        if (s === 'low') return { bg: COLORS.infoBg, text: COLORS.infoText };
        return { bg: COLORS.bgLight, text: COLORS.textMuted };
      };

      // Draws a navy section header bar with an amber underline accent,
      // then advances the cursor below it.
      const drawSectionHeader = (title: string) => {
        const y = doc.y;
        doc.roundedRect(margin, y, contentWidth, 26, 4).fill(COLORS.navy);
        doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.white)
          .text(title.toUpperCase(), margin + 14, y + 8, { characterSpacing: 0.5 });
        doc.rect(margin, y + 26, 42, 3).fill(COLORS.amber);
        doc.fillColor(COLORS.textDark);
        doc.y = y + 26 + 3 + 12;
      };

      // -----------------------------------------------------------------
      // Cover page
      // -----------------------------------------------------------------

      // Top brand band
      doc.rect(0, 0, pageWidth, 130).fill(COLORS.navy);
      doc.rect(0, 130, pageWidth, 6).fill(COLORS.amber);

      doc.font('Helvetica-Bold').fontSize(30).fillColor(COLORS.white)
        .text('TidyFlow', margin, 42);
      doc.font('Helvetica').fontSize(12).fillColor(COLORS.amberLight)
        .text('PROPERTY CLEANING REPORT', margin, 80, { characterSpacing: 1.5 });

      doc.fillColor(COLORS.textDark);
      let coverY = 168;

      // Task title with amber accent bar
      doc.rect(margin, coverY, 5, 26).fill(COLORS.amber);
      doc.font('Helvetica-Bold').fontSize(19).fillColor(COLORS.navy)
        .text(task.title, margin + 16, coverY + 1, { width: contentWidth - 16 });
      coverY = doc.y + 22;

      // Info card
      const cardHeight = 148;
      doc.roundedRect(margin, coverY, contentWidth, cardHeight, 8)
        .fillAndStroke(COLORS.bgLight, COLORS.border);

      const col1X = margin + 24;
      const col2X = margin + contentWidth / 2 + 8;
      const lineGap = 34;
      let rowY = coverY + 22;

      const infoRow = (label: string, value: string, x: number, y: number) => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.textMuted)
          .text(label.toUpperCase(), x, y, { characterSpacing: 0.5 });
        doc.font('Helvetica').fontSize(11).fillColor(COLORS.textDark)
          .text(value, x, y + 12, { width: contentWidth / 2 - 40 });
      };

      infoRow('Task ID', String(task.id), col1X, rowY);
      infoRow('Property', task.property?.address || 'N/A', col2X, rowY);
      rowY += lineGap;

      const cleanerName = task.assignedUser
        ? (`${task.assignedUser.firstName || ''} ${task.assignedUser.lastName || ''}`.trim() || task.assignedUser.email)
        : 'Unassigned';
      infoRow('Cleaner', cleanerName, col1X, rowY);
      infoRow('Scheduled Date', task.scheduledDate ? new Date(task.scheduledDate).toLocaleString() : 'N/A', col2X, rowY);
      rowY += lineGap;

      // Status badge
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.textMuted)
        .text('STATUS', col1X, rowY, { characterSpacing: 0.5 });
      const statusColors = getStatusColor(task.status);
      const badgeText = String(task.status).toUpperCase();
      doc.font('Helvetica-Bold').fontSize(10);
      const badgeWidth = doc.widthOfString(badgeText) + 22;
      doc.roundedRect(col1X, rowY + 12, badgeWidth, 20, 10).fill(statusColors.bg);
      doc.fillColor(statusColors.text).text(badgeText, col1X + 11, rowY + 17);

      doc.fillColor(COLORS.textDark);
      doc.y = coverY + cardHeight + 30;

      // Description
      if (task.description) {
        drawSectionHeader('Description');
        doc.font('Helvetica').fontSize(10).fillColor(COLORS.textDark)
          .text(task.description, margin, doc.y, { width: contentWidth, lineGap: 3 });
        doc.moveDown(1.5);
      }

      // Checklist Section
      if (task.checklists && task.checklists.length > 0) {
        drawSectionHeader('Checklist Acknowledgment');

        const completedCount = task.checklists.filter(c => c.isCompleted).length;
        const pct = Math.round((completedCount / task.checklists.length) * 100);

        const barY = doc.y;
        doc.roundedRect(margin, barY, contentWidth, 10, 5).fill(COLORS.border);
        doc.roundedRect(margin, barY, Math.max(10, (contentWidth * pct) / 100), 10, 5).fill(COLORS.amber);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.textMuted)
          .text(`${completedCount}/${task.checklists.length} completed (${pct}%)`, margin, barY + 16);
        doc.y = barY + 36;

        task.checklists.forEach((item) => {
          const rowY2 = doc.y;
          if (item.isCompleted) {
            doc.roundedRect(margin, rowY2, 12, 12, 3).fill(COLORS.success);
            doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.white)
              .text('✓', margin + 3, rowY2 + 1);
          } else {
            doc.roundedRect(margin, rowY2, 12, 12, 3).fillAndStroke(COLORS.white, COLORS.border);
          }
          doc.font('Helvetica').fontSize(10).fillColor(COLORS.textDark)
            .text(item.title, margin + 20, rowY2, { width: contentWidth - 20 });
          doc.y = Math.max(doc.y, rowY2 + 16);
        });
        doc.moveDown(1);
      }

      // Issues Section
      const issues = task.notes.filter(n => n.noteType === 'issue');
      if (issues.length > 0) {
        drawSectionHeader('Reported Issues');
        issues.forEach((issue) => {
          const rowY2 = doc.y;
          const sevColors = getSeverityColor(issue.severity);
          const sevText = (issue.severity || 'N/A').toUpperCase();
          doc.font('Helvetica-Bold').fontSize(8);
          const badgeW = doc.widthOfString(sevText) + 16;
          doc.roundedRect(margin, rowY2, badgeW, 16, 8).fill(sevColors.bg);
          doc.fillColor(sevColors.text).text(sevText, margin + 8, rowY2 + 4);
          doc.font('Helvetica').fontSize(10).fillColor(COLORS.textDark)
            .text(issue.content, margin + badgeW + 12, rowY2 + 2, { width: contentWidth - badgeW - 12 });
          doc.y = Math.max(doc.y, rowY2 + 20) + 6;
        });
        doc.fillColor(COLORS.textDark);
        doc.moveDown(0.5);
      }

      // Notes Section
      const notes = task.notes.filter(n => n.noteType !== 'issue');
      if (notes.length > 0) {
        drawSectionHeader('Notes');
        notes.forEach((note) => {
          const rowY2 = doc.y;
          doc.font('Helvetica').fontSize(10);
          const textHeight = doc.heightOfString(note.content, { width: contentWidth - 20 });
          doc.rect(margin, rowY2, 3, Math.max(textHeight, 12) + 8).fill(COLORS.amber);
          doc.fillColor(COLORS.textDark)
            .text(note.content, margin + 14, rowY2 + 2, { width: contentWidth - 20 });
          doc.y = rowY2 + Math.max(textHeight, 12) + 14;
        });
        doc.moveDown(0.5);
      }

      // Photo Evidence Section
      const renderPhotoSection = (
        title: string,
        photos: Photo[],
        buffers: (Buffer | null)[]
      ) => {
        if (!photos.length) return;

        doc.addPage();

        // Title bar
        const y0 = margin;
        doc.roundedRect(margin, y0, contentWidth, 30, 4).fill(COLORS.navy);
        doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.white)
          .text(title.toUpperCase(), margin + 14, y0 + 9, { characterSpacing: 0.5 });
        doc.rect(margin, y0 + 30, 50, 3).fill(COLORS.amber);
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.textMuted)
          .text(`${photos.length} photo${photos.length === 1 ? '' : 's'}`, margin, y0 + 40);
        doc.fillColor(COLORS.textDark);

        // Layout constants for 2 images per row
        const maxWidth = 220;
        const maxHeight = 248;
        const leftX = margin;
        const rightX = margin + 260;
        const rowSpacing = 30;

        let currentY = y0 + 64;

        for (let i = 0; i < photos.length; i += 2) {
          // If we're too close to the bottom, start a new page
          if (currentY > 700 - maxHeight) {
            doc.addPage();
            currentY = margin;
          }

          const leftPhoto = photos[i];
          const rightPhoto = photos[i + 1];
          const leftBuffer = buffers[i];
          const rightBuffer = buffers[i + 1];

          // Caption for the row
          const captionIndex =
            rightPhoto && rightPhoto !== undefined
              ? `PHOTOS ${i + 1} – ${i + 2}`
              : `PHOTO ${i + 1}`;

          doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.amberDark)
            .text(captionIndex, leftX, currentY, { characterSpacing: 0.5 });
          currentY = doc.y + 6;

          // Helper to draw a single image at a given x
          const drawImage = (photo: Photo | undefined, buffer: Buffer | null | undefined, x: number) => {
            if (!photo) return;

            let imageDrawn = false;

            // Framed border around the photo slot
            doc.roundedRect(x - 3, currentY - 3, maxWidth + 6, maxHeight + 6, 6)
              .lineWidth(1).stroke(COLORS.border);

            if (buffer) {
              try {
                doc.image(buffer, x, currentY, {
                  fit: [maxWidth, maxHeight],
                });
                imageDrawn = true;
              } catch (error) {
                console.error(`Error embedding photo ${photo.id}:`, error);
              }
            }

            if (!imageDrawn) {
              // If we couldn't draw the image, at least mark the spot
              doc.roundedRect(x, currentY, maxWidth, maxHeight, 4).fill(COLORS.bgLight);
              doc
                .fontSize(9)
                .font('Helvetica')
                .fillColor(COLORS.textMuted)
                .text('[Error loading image]', x, currentY + maxHeight / 2 - 5, { width: maxWidth, align: 'center' });
              doc.fillColor(COLORS.textDark);
            }
          };

          drawImage(leftPhoto, leftBuffer, leftX);
          drawImage(rightPhoto, rightBuffer, rightX);

          // Row metadata (takenAt) under the images
          const metaY = currentY + maxHeight + 8;
          if (leftPhoto?.takenAt) {
            doc
              .fontSize(8)
              .font('Helvetica')
              .fillColor(COLORS.textMuted)
              .text(`Taken: ${new Date(leftPhoto.takenAt).toLocaleString()}`, leftX, metaY);
          }
          if (rightPhoto?.takenAt) {
            doc
              .fontSize(8)
              .font('Helvetica')
              .fillColor(COLORS.textMuted)
              .text(`Taken: ${new Date(rightPhoto.takenAt).toLocaleString()}`, rightX, metaY);
          }
          doc.fillColor(COLORS.textDark);

          // Advance Y for next row
          currentY = metaY + rowSpacing;
        }
      };

      if (pdfType === 'before') {
        renderPhotoSection('Before Photos', photosToInclude, photoBuffers);
      } else if (pdfType === 'after') {
        renderPhotoSection('After Photos', photosToInclude, photoBuffers);
      } else {
        const beforePhotoBuffers = (photoBuffers as any).before || [];
        const afterPhotoBuffers = (photoBuffers as any).after || [];

        renderPhotoSection('Before Photos', beforePhotos, beforePhotoBuffers);
        renderPhotoSection('After Photos', afterPhotos, afterPhotoBuffers);
      }

      // Summary
      doc.addPage();
      drawSectionHeader('Summary Overview');

      const stats: { label: string; value: string }[] = [];
      if (pdfType === 'before') {
        stats.push({ label: 'Before Photos', value: String(photosToInclude.length) });
      } else if (pdfType === 'after') {
        stats.push({ label: 'After Photos', value: String(photosToInclude.length) });
      } else {
        stats.push({ label: 'Total Photos', value: String(task.photos.length) });
        stats.push({ label: 'Before Photos', value: String(beforePhotos.length) });
        stats.push({ label: 'After Photos', value: String(afterPhotos.length) });
      }
      stats.push({ label: 'Issues Reported', value: String(issues.length) });
      stats.push({ label: 'Checklist Items', value: String(task.checklists?.length || 0) });

      const cardsPerRow = 3;
      const cardGap = 14;
      const cardW = (contentWidth - cardGap * (cardsPerRow - 1)) / cardsPerRow;
      const cardH = 74;
      const gridStartY = doc.y;

      stats.forEach((stat, idx) => {
        const col = idx % cardsPerRow;
        const row = Math.floor(idx / cardsPerRow);
        const x = margin + col * (cardW + cardGap);
        const y = gridStartY + row * (cardH + cardGap);
        doc.roundedRect(x, y, cardW, cardH, 6).fillAndStroke(COLORS.bgLight, COLORS.border);
        doc.font('Helvetica-Bold').fontSize(22).fillColor(COLORS.navy)
          .text(stat.value, x + 14, y + 14);
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.textMuted)
          .text(stat.label.toUpperCase(), x + 14, y + 46, { width: cardW - 28, characterSpacing: 0.3 });
      });

      const totalRows = Math.ceil(stats.length / cardsPerRow);
      doc.fillColor(COLORS.textDark);
      doc.y = gridStartY + totalRows * (cardH + cardGap) + 20;

      doc.roundedRect(margin, doc.y, contentWidth, 1, 0).fill(COLORS.border);
      doc.y += 16;
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.textMuted)
        .text(`Report generated: ${new Date().toLocaleString()}`, margin, doc.y);
      doc.fillColor(COLORS.textDark);

      // -----------------------------------------------------------------
      // Global footer — TidyFlow branding + page numbers on every page
      // -----------------------------------------------------------------
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const bottomY = doc.page.height - 40;
        doc.rect(margin, bottomY, contentWidth, 0.75).fill(COLORS.border);
        doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.navy)
          .text('TidyFlow', margin, bottomY + 8);
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.textMuted)
          .text(`Page ${i - range.start + 1} of ${range.count}`, margin, bottomY + 8, {
            width: contentWidth,
            align: 'right',
          });
      }

      doc.end();
    });
    
    // Generate checksum for immutable storage
    const checksum = await generateImmutableChecksum(pdfBuffer);
    
    // Upload to Cloudinary and get URL
    const { uploadPDFToCloudinary } = await import("@/lib/cloudinary");
    const uploadResult = await uploadPDFToCloudinary(pdfBuffer, task.id, checksum);
    
    if (!uploadResult.success || !uploadResult.url) {
      throw new Error("Failed to upload PDF to Cloudinary: " + (uploadResult.error || "Unknown error"));
    }
    
    const pdfUrl = uploadResult.url;
    const fileSize = pdfBuffer.length;

    // Store PDF record with checksum in database
    const prisma = (await import("@/lib/prisma")).default;
    await prisma.pDFRecord.create({
      data: {
        taskId: task.id,
        url: pdfUrl,
        checksum,
        fileSize,
        pdfType,
        generatedAt: new Date(),
      },
    });

    const duration = Date.now() - startTime;
    console.log(`✅ PDF generated for task ${task.id} in ${duration}ms (checksum: ${checksum})`);

    // Ensure generation is under 60 seconds requirement
    if (duration > 60000) {
      console.warn(`⚠️ PDF generation took ${duration}ms (exceeds 60s requirement)`);
    }



    return {
      success: true,
      pdfUrl,
      pdfBuffer,
      checksum,
      generatedAt: new Date(),
    };
  } catch (error) {
    console.error('PDF generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('PDF generation error stack:', errorStack);
    return {
      success: false,
      error: errorMessage,
      generatedAt: new Date(),
    };
  }
}























export function validatePhotoRequirements(photos: Photo[], minCount: number = 20): {
  valid: boolean;
  beforeCount: number;
  afterCount: number;
  errors: string[];
} {
  const beforePhotos = photos.filter(p => p.photoType === 'before');
  const afterPhotos = photos.filter(p => p.photoType === 'after');
  const errors: string[] = [];

  if (beforePhotos.length < minCount) {
    errors.push(`Insufficient before photos: ${beforePhotos.length}/${minCount}`);
  }

  if (afterPhotos.length < minCount) {
    errors.push(`Insufficient after photos: ${afterPhotos.length}/${minCount}`);
  }

  return {
    valid: errors.length === 0,
    beforeCount: beforePhotos.length,
    afterCount: afterPhotos.length,
    errors,
  };
}

/**
 * Generate invoice PDF for billing record
 * (Design intentionally left unchanged — only the MayaOps -> TidyFlow rebrand applied.)
 */
export async function generateBillingInvoicePDF(
  billingRecord: {
    id: number;
    company: { name: string };
    amountPaid: number;
    amountDue: number;
    billingDate: Date | null;
    propertyCount: number;
    status: string;
    subscriptionId?: string | null;
  }
): Promise<PDFGenerationResult> {
  const startTime = Date.now();

  try {
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).font('Helvetica').text('TidyFlow', { align: 'center' });
      doc.moveDown(2);

      // Invoice details
      doc.fontSize(10).font('Helvetica');
      doc.text(`Invoice Number: INV-${billingRecord.id.toString().padStart(6, '0')}`);
      doc.text(`Invoice Date: ${billingRecord.billingDate ? new Date(billingRecord.billingDate).toLocaleDateString('en-GB') : 'N/A'}`);
      doc.text(`Status: ${billingRecord.status.toUpperCase()}`);
      if (billingRecord.subscriptionId) {
        doc.text(`Subscription ID: ${billingRecord.subscriptionId}`);
      }
      doc.moveDown();

      // Bill to
      doc.fontSize(12).font('Helvetica-Bold').text('Bill To:');
      doc.fontSize(10).font('Helvetica');
      doc.text(billingRecord.company.name);
      doc.moveDown();

      // Items table
      doc.fontSize(12).font('Helvetica-Bold').text('Invoice Details');
      doc.moveDown(0.5);
      
      const tableTop = doc.y;
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Description', 50, tableTop);
      doc.text('Quantity', 350, tableTop);
      doc.text('Amount', 450, tableTop);
      
      doc.moveDown(0.5);
      doc.lineWidth(1).strokeColor('#000000');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      
      doc.fontSize(10).font('Helvetica');
      doc.text('Base Subscription', 50, doc.y + 5);
      doc.text('1', 350, doc.y);
      doc.text(`£${billingRecord.amountPaid.toFixed(2)}`, 450, doc.y);
      
      doc.moveDown();
      doc.text(`Properties (${billingRecord.propertyCount} properties)`, 50, doc.y);
      doc.text(`${billingRecord.propertyCount}`, 350, doc.y);
      doc.text(`£${(billingRecord.propertyCount * 1).toFixed(2)}`, 450, doc.y);
      
      doc.moveDown(2);
      doc.lineWidth(1).strokeColor('#000000');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);
      
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('Total Amount:', 350, doc.y);
      doc.text(`£${billingRecord.amountPaid.toFixed(2)}`, 450, doc.y);
      
      if (billingRecord.amountDue > 0) {
        doc.moveDown();
        doc.fontSize(10).font('Helvetica');
        doc.text(`Amount Due: £${billingRecord.amountDue.toFixed(2)}`, 350, doc.y);
      }

      // Footer
      doc.moveDown(4);
      doc.fontSize(8).font('Helvetica').text('Thank you for your business!', { align: 'center' });
      doc.text('Generated by TidyFlow', { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });

      doc.end();
    });

    const checksum = await generateImmutableChecksum(pdfBuffer);
    
    // Upload with invoice-specific public ID
    const publicId = `mayaops/invoices/billing-${billingRecord.id}_${checksum.substring(0, 16)}.pdf`;
    const base64PDF = pdfBuffer.toString('base64');
    const dataUri = `data:application/pdf;base64,${base64PDF}`;
    
    const { v2: cloudinary } = await import("cloudinary");
    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      public_id: publicId,
      folder: 'mayaops/invoices',
      resource_type: 'raw',
      overwrite: false,
    });

    if (!uploadResult.secure_url) {
      throw new Error('Failed to upload invoice PDF to Cloudinary');
    }

    return {
      success: true,
      pdfUrl: uploadResult.secure_url,
      pdfBuffer,
      checksum,
      generatedAt: new Date(),
    };
  } catch (error) {
    console.error('Invoice PDF generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      generatedAt: new Date(),
    };
  }
}

/**
 * Generate invoice PDF for payroll record (styled payslip — see payroll-invoice.ts)
 */
export async function generatePayrollInvoicePDF(
  payrollRecord: Parameters<typeof import('@/lib/payroll-invoice').generatePayrollInvoicePDF>[0]
): Promise<PDFGenerationResult> {
  const { generatePayrollInvoicePDF: generateStyled } = await import('@/lib/payroll-invoice');
  return generateStyled(payrollRecord);
}

// Legacy inline implementation removed — replaced by web/lib/payroll-invoice.ts

export async function generateImmutableChecksum(pdfBuffer: Buffer): Promise<string> {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(pdfBuffer).digest('hex');
}