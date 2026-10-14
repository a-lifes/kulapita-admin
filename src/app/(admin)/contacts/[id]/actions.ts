'use server';

import { CaseFormState, updateCaseStatus } from '@/lib/caseStatus';

export type ContactFormState = CaseFormState;

export async function updateContactAction(id: string, _prev: CaseFormState, formData: FormData): Promise<CaseFormState> {
  return updateCaseStatus({
    table: 'contacts',
    auditAction: 'contact.update',
    targetType: 'contact',
    detailPath: `/contacts/${id}`,
    id,
    formData,
  });
}
