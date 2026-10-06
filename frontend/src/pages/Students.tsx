import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { api, fmtDate } from '../lib/api';
import { PageHeader } from '../components/layout/AppLayout';
import { DataTable, Badge } from '../components/ui/DataTable';
import { useAuth, HO_ROLES } from '../lib/auth';

interface StudentRow {
  id: string; admissionNo: string; firstName: string; lastName: string;
  gender: string; dob: string; fatherName: string; fatherPhone: string;
  addressArea: string; status: string; admissionDate: string; instalmentPlan: string;
  programme: { name: string; tierName: string; levelColour: string } | null;
  batch: { name: string; shift: string } | null;
  unit: { code: string; name: string };
  siblingGroup: string | null;
}

const PLAN_LABEL: Record<string, string> = { PLAN_A: 'Plan A · 3 inst.', PLAN_B: 'Plan B · 2 inst.', PLAN_C: 'Plan C · Full' };

export default function Students() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['students'], queryFn: () => api<StudentRow[]>('/students') });
  const isHO = HO_ROLES.includes(user?.role || '');

  const students = data ?? [];
  const active = students.filter(s => s.status === 'ACTIVE').length;
  const siblings = students.filter(s => s.siblingGroup).length;
  const byUnit = ['U1', 'U2', 'U3'].map(c => ({ code: c, n: students.filter(s => s.unit.code === c).length }));

  const columns: ColumnDef<StudentRow, any>[] = [
    {
      id: 'student', header: 'Student',
      accessorFn: r => `${r.firstName} ${r.lastName} ${r.admissionNo}`,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-heading text-[12.5px] font-extrabold text-ink/70 shadow-neo-xs border border-black/5"
              style={{ background: s.programme?.levelColour ?? '#eee' }}
            >
              {s.firstName.charAt(0)}{s.lastName.charAt(0)}
            </div>
            <div>
              <div className="font-bold text-[13px]">
                {s.firstName} {s.lastName} {s.siblingGroup && <span title="Sibling concession linked">👧👦</span>}
              </div>
              <div className="text-[11px] text-stone-500">{s.admissionNo}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'programme', header: 'Programme',
      accessorFn: r => r.programme?.name ?? '',
      cell: ({ row }) => {
        const p = row.original.programme;
        return p ? (
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: p.levelColour }} />
            <div>
              <div className="text-[12.5px] font-semibold">{p.name}</div>
              <div className="text-[10.5px] text-stone-500">{p.tierName}</div>
            </div>
          </div>
        ) : '—';
      },
    },
    { id: 'batch', header: 'Batch', accessorFn: r => r.batch?.name ?? '—',
      cell: ({ row }) => <span className="text-[12px] text-stone-700">{row.original.batch?.name ?? '—'}</span> },
    ...(isHO ? [{
      id: 'unit', header: 'Unit', accessorFn: (r: StudentRow) => r.unit.code,
      cell: ({ row }: any) => <Badge tone="sky">{row.original.unit.code}</Badge>,
    } as ColumnDef<StudentRow, any>] : []),
    { id: 'parent', header: 'Parent Contact', accessorFn: r => `${r.fatherName} ${r.fatherPhone}`,
      cell: ({ row }) => (
        <div>
          <div className="text-[12.5px] font-medium">{row.original.fatherName}</div>
          <div className="text-[11px] text-stone-500">{row.original.fatherPhone}</div>
        </div>
      ) },
    { id: 'plan', header: 'Fee Plan', accessorFn: r => PLAN_LABEL[r.instalmentPlan] ?? '',
      cell: ({ getValue }) => <Badge tone="violet">{getValue() || '—'}</Badge> },
    { id: 'admitted', header: 'Admitted', accessorFn: r => r.admissionDate,
      cell: ({ getValue }) => <span className="text-[12px] text-stone-600">{getValue() ? fmtDate(getValue()) : '—'}</span> },
    { id: 'status', header: 'Status', accessorFn: r => r.status,
      cell: ({ getValue }) => (
        <Badge tone={getValue() === 'ACTIVE' ? 'green' : getValue() === 'GRADUATED' ? 'sky' : 'stone'} dot>
          {getValue()}
        </Badge>
      ) },
  ];

  return (
    <div>
      <PageHeader
        title="Students"
        count={`${students.length} enrolled`}
        subtitle={`AY 2026-27 ${isHO ? '· all units' : `· ${user?.unitName}`}`}
      />

      {/* ── Stat chips ── */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <span className="chip"><span className="chip-dot bg-emerald-500" /> Active <b className="text-ink">{active}</b></span>
        <span className="chip"><span className="chip-dot bg-honey-500" /> Sibling-linked <b className="text-ink">{siblings}</b></span>
        {isHO && byUnit.map(u => (
          <span key={u.code} className="chip">{u.code} <b className="text-ink">{u.n}</b></span>
        ))}
      </div>

      <DataTable
        title="Student Register"
        columns={columns}
        data={students}
        isLoading={isLoading}
        searchPlaceholder="Search name, admission no, parent…"
        exportName="students"
        filterable={[
          { id: 'programme', label: 'Programme' },
          { id: 'status', label: 'Status' },
          { id: 'plan', label: 'Fee Plan' },
          ...(isHO ? [{ id: 'unit', label: 'Unit' }] : []),
        ]}
        onRowClick={() => { /* 18-tab profile — Slice 3 */ }}
      />
    </div>
  );
}
