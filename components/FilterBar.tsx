type Props = {
  filterStatus: string
  filterPrio: string
  onStatusChange: (v: string) => void
  onPrioChange: (v: string) => void
}

const statusOpts = ['Alle', 'Open', 'In behandeling', 'Afgerond']
const prioOpts   = ['Alle', 'Hoog', 'Middel', 'Laag']

function Pill({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-2 min-h-[44px] inline-flex items-center rounded-full border transition-colors ${
        active
          ? 'bg-ink text-white border-ink'
          : 'bg-white text-ink/60 border-ink/20 hover:border-ink/40'
      }`}
    >
      {label}
    </button>
  )
}

export default function FilterBar({ filterStatus, filterPrio, onStatusChange, onPrioChange }: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex flex-wrap gap-2">
        {statusOpts.map(s => (
          <Pill key={s} label={s} active={filterStatus === s} onClick={() => onStatusChange(s)} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {prioOpts.map(p => (
          <Pill key={p} label={p} active={filterPrio === p} onClick={() => onPrioChange(p)} />
        ))}
      </div>
    </div>
  )
}
