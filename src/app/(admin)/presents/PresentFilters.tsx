'use client';

import { useState } from 'react';
import { PRESENT_STATUS_LABEL } from '@/lib/format';
import { ClearButton, SearchButton, SearchForm } from '@/components/SearchForm';

/**
 * 絞り込み。景品の選択肢は選んだキャンペーンの景品だけを出す
 * (景品番号はキャンペーンごとに振られているため、キャンペーン未選択のときは選べない)。
 */
export function PresentFilters({
  campaigns,
  itemsByCampaign,
  initial,
}: {
  campaigns: string[];
  itemsByCampaign: Record<string, { index: number; name: string }[]>;
  initial: { campaign?: string; item?: string; status?: string };
}) {
  const [campaign, setCampaign] = useState(initial.campaign ?? '');
  const [item, setItem] = useState(initial.item ?? '');
  const items = campaign ? (itemsByCampaign[campaign] ?? []) : [];

  return (
    <SearchForm className="card mb-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="label" htmlFor="campaign">キャンペーン （月）</label>
        <select
          className="input"
          id="campaign"
          name="campaign"
          value={campaign}
          onChange={(e) => {
            setCampaign(e.target.value);
            setItem('');
          }}
        >
          <option value="">すべて</option>
          {campaigns.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="item">景品</label>
        <select
          className="input max-w-72"
          id="item"
          name="item"
          value={item}
          disabled={!campaign}
          onChange={(e) => setItem(e.target.value)}
        >
          <option value="">{campaign ? 'すべて' : 'キャンペーンを選んでください'}</option>
          {items.map((i) => (
            <option key={i.index} value={String(i.index)}>
              {i.index + 1}. {i.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="status">結果</label>
        <select className="input" id="status" name="status" defaultValue={initial.status ?? ''}>
          <option value="">すべて</option>
          {Object.entries(PRESENT_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <SearchButton />
      <ClearButton href="/presents" />
    </SearchForm>
  );
}
