-- Compliance document vault for company safety & regulatory files
CREATE TABLE "compliance_documents" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "file_url" TEXT,
    "file_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3),
    "notes" TEXT,
    "uploaded_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "compliance_documents_company_id_idx" ON "compliance_documents"("company_id");
CREATE INDEX "compliance_documents_doc_type_idx" ON "compliance_documents"("doc_type");
CREATE INDEX "compliance_documents_status_idx" ON "compliance_documents"("status");

ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
