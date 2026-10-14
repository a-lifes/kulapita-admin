import { NextRequest } from 'next/server';
import { writeAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/guard';
import { csvResponse, toCsv } from '@/lib/csv';
import { query } from '@/lib/db';
import { MEMBER_COLUMNS, memberFromRow } from '@/lib/members';
import {
  CONTACT_STATUS_LABEL,
  formatJst,
  label,
  NEWSLETTER_STATUS_LABEL,
  PLACEMENT_LABEL,
  PRESENT_STATUS_LABEL,
} from '@/lib/format';
import { contactWhere, normalizeContactFilter } from '@/lib/queries/contacts';
import {
  applicationWhere,
  clickWhere,
  normalizeApplicationFilter,
  normalizeClickFilter,
} from '@/lib/queries/conversions';
import { resolveRange } from '@/lib/dateRange';
import {
  newsletterWhere,
  normalizeNewsletterFilter,
  normalizePresentFilter,
  presentWhere,
} from '@/lib/queries/lists';

export const dynamic = 'force-dynamic';

/** 1 回のダウンロードの上限 (これを超える場合は絞り込んでから出力する) */
const MAX_ROWS = 20_000;

type Row = Record<string, string | number | null>;

function stamp(): string {
  const now = new Date(Date.now() + 9 * 3600_000);
  return now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  // CSV には個人情報がまとめて入るため「管理者」以上に限る
  const admin = await requireAdmin('admin');
  const { kind } = await params;
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());

  if (kind === 'contacts') {
    const filter = normalizeContactFilter(sp);
    const where = contactWhere(filter);
    const { rows } = await query<Row>(
      `SELECT c.reception_number, c.created_at, c.category, c.status, a.display_name AS assignee,
              u.external_id AS member_id, c.name, c.zipcode, c.prefecture, c.city, c.building, c.phone, c.email,
              c.message, c.admin_notes, c.responded_at
       FROM contacts c
       LEFT JOIN admin_users a ON a.id = c.assigned_to
       LEFT JOIN users u ON u.id = c.user_id
       WHERE ${where.sql} ORDER BY c.created_at DESC LIMIT ${MAX_ROWS}`,
      where.params,
    );
    await writeAudit({ admin, action: 'export.contacts', diff: { filter, rows: rows.length } });
    return csvResponse(
      `contacts_${stamp()}.csv`,
      toCsv(
        ['受付番号', '受付日時', 'お問い合わせの種類', '対応状況', '担当者', '会員番号', 'お名前', '郵便番号',
          '都道府県', '市区町村・番地', '建物名', '電話番号', 'メールアドレス', 'お問い合わせ内容', '対応メモ',
          '対応完了日時'],
        rows.map((r) => [
          r.reception_number, formatJst(r.created_at), r.category,
          label(CONTACT_STATUS_LABEL, r.status), r.assignee, r.member_id, r.name, r.zipcode, r.prefecture, r.city,
          r.building, r.phone, r.email, r.message, r.admin_notes, formatJst(r.responded_at),
        ]),
      ),
    );
  }

  if (kind === 'applications') {
    const filter = normalizeApplicationFilter(sp);
    const where = applicationWhere(filter);
    const { rows } = await query<Row>(
      `SELECT s.reception_number, s.created_at, s.service_name, s.service_company, s.service_url, s.status,
              a.display_name AS assignee, u.external_id AS member_id, s.name, s.zipcode, s.prefecture, s.city,
              s.building, s.phone, s.email, s.message, s.admin_notes, s.responded_at
       FROM service_applications s
       LEFT JOIN admin_users a ON a.id = s.assigned_to
       LEFT JOIN users u ON u.id = s.user_id
       WHERE ${where.sql} ORDER BY s.created_at DESC LIMIT ${MAX_ROWS}`,
      where.params,
    );
    await writeAudit({ admin, action: 'export.applications', diff: { filter, rows: rows.length } });
    return csvResponse(
      `申し込み_${stamp()}.csv`,
      toCsv(
        ['受付番号', '受付日時', 'サービス名', 'サービス提供会社', 'サービスのページ', '対応状況', '担当者', '会員番号',
          'お名前', '郵便番号', '都道府県', '市区町村・番地', '建物名', '電話番号', 'メールアドレス', 'ご要望・ご質問',
          '対応メモ', '対応完了日時'],
        rows.map((r) => [
          r.reception_number, formatJst(r.created_at), r.service_name, r.service_company, r.service_url,
          label(CONTACT_STATUS_LABEL, r.status), r.assignee, r.member_id, r.name, r.zipcode, r.prefecture, r.city,
          r.building, r.phone, r.email, r.message, r.admin_notes, formatJst(r.responded_at),
        ]),
      ),
    );
  }

  if (kind === 'clicks') {
    const range = resolveRange(sp);
    const filter = normalizeClickFilter(sp);
    const where = clickWhere(filter, range);
    const { rows } = await query<Row>(
      `SELECT k.created_at, k.service_slug, k.service_name, k.service_company, k.placement, k.destination_url,
              k.page_url, u.external_id AS member_id
       FROM outbound_clicks k LEFT JOIN users u ON u.id = k.user_id
       WHERE ${where.sql} ORDER BY k.created_at DESC LIMIT ${MAX_ROWS}`,
      where.params,
    );
    await writeAudit({
      admin,
      action: 'export.clicks',
      diff: { filter: { from: range.from, to: range.to, ...filter }, rows: rows.length },
    });
    const ymd = (s: string) => s.replaceAll('-', '');
    return csvResponse(
      `誘導_${ymd(range.from)}-${ymd(range.to)}_${stamp()}.csv`,
      toCsv(
        ['日時', 'サービス ID', 'サービス名', 'サービス提供会社', 'ボタンの場所', '誘導先', 'クリックしたページ', '会員番号'],
        rows.map((r) => [
          formatJst(r.created_at), r.service_slug, r.service_name, r.service_company,
          label(PLACEMENT_LABEL, r.placement), r.destination_url, r.page_url, r.member_id,
        ]),
      ),
    );
  }

  if (kind === 'newsletter') {
    const filter = normalizeNewsletterFilter(sp);
    const where = newsletterWhere(filter);
    const { rows } = await query<Row>(
      `SELECT n.email, n.last_name, n.first_name, n.status, u.external_id AS member_id, n.subscribed_at,
              n.unsubscribed_at, n.source_url
       FROM newsletter_subscribers n LEFT JOIN users u ON u.id = n.user_id
       WHERE ${where.sql} ORDER BY n.subscribed_at DESC LIMIT ${MAX_ROWS}`,
      where.params,
    );
    await writeAudit({ admin, action: 'export.newsletter', diff: { filter, rows: rows.length } });
    return csvResponse(
      `newsletter_${stamp()}.csv`,
      toCsv(
        ['メールアドレス', '姓', '名', '状態', '会員番号', '登録日時', '解除日時', '登録したページ'],
        rows.map((r) => [
          r.email, r.last_name, r.first_name, label(NEWSLETTER_STATUS_LABEL, r.status), r.member_id,
          formatJst(r.subscribed_at), formatJst(r.unsubscribed_at), r.source_url,
        ]),
      ),
    );
  }

  if (kind === 'presents') {
    const filter = normalizePresentFilter(sp);
    const where = presentWhere(filter);
    const { rows } = await query<Row>(
      `SELECT p.campaign_key, p.item_index, p.item_name, p.email, p.status, p.created_at, ${MEMBER_COLUMNS}
       FROM present_applications p LEFT JOIN users u ON u.id = p.user_id
       WHERE ${where.sql} ORDER BY p.campaign_key DESC, p.item_index, p.created_at LIMIT ${MAX_ROWS}`,
      where.params,
    );
    await writeAudit({ admin, action: 'export.presents', diff: { filter, rows: rows.length } });
    // ファイル名: プレゼント_{キャンペーンの年月 yyyymm}_{出力日時 yyyymmddhhmm}.csv
    const month = filter.campaign ? filter.campaign.replace(/[^0-9A-Za-z]/g, '') : '全キャンペーン';
    return csvResponse(
      `プレゼント_${month}_${stamp()}.csv`,
      toCsv(
        ['キャンペーン', '景品番号', '景品名', '結果', '応募日時', '応募時のメールアドレス',
          '会員番号', 'お名前', '会員のメールアドレス', '電話番号', '郵便番号', '都道府県', '市区町村・番地',
          '建物名・部屋番号', '会員情報の更新日時'],
        rows.map((r) => {
          const m = memberFromRow(r);
          return [
            r.campaign_key, Number(r.item_index) + 1, r.item_name, label(PRESENT_STATUS_LABEL, r.status),
            formatJst(r.created_at), r.email,
            m?.external_id, m?.display_name, m?.email, m?.phone, m?.zipcode, m?.prefecture, m?.city, m?.building,
            formatJst(m?.profile_updated_at),
          ];
        }),
      ),
    );
  }

  return new Response('Not Found', { status: 404 });
}
