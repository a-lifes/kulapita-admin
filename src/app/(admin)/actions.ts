'use server';

import { redirect } from 'next/navigation';
import { writeAudit } from '@/lib/audit';
import { getCurrentAdmin } from '@/lib/auth/guard';
import { endSession } from '@/lib/auth/session';

export async function logoutAction(): Promise<void> {
  const admin = await getCurrentAdmin();
  if (admin) await writeAudit({ admin, action: 'auth.logout' });
  await endSession();
  redirect('/login');
}
