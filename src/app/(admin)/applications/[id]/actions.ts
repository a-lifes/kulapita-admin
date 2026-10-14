'use server';

import { CaseFormState, updateCaseStatus } from '@/lib/caseStatus';

export async function updateApplicationAction(id: string, _prev: CaseFormState, formData: FormData): Promise<CaseFormState> {
  return updateCaseStatus({
    table: 'service_applications',
    auditAction: 'application.update',
    targetType: 'service_application',
    detailPath: `/applications/${id}`,
    id,
    formData,
  });
}
