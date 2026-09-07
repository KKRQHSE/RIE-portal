// Kleine, herbruikbare badge om te tonen dat een RI&E-vraag, inspectie,
// toolbox-sessie, actie of incident aan een specifieke locatie hangt. Geen
// badge bij locatie_id = null (organisatiebreed) — dat is de meerderheid en
// hoeft niet extra gemarkeerd. Zelfde stijl als de klasse-badge in ModuleCard.

export type LocatieNaamMap = Record<string, string>

export default function LocatieBadge({
  locatieId,
  locatieNaam,
}: {
  locatieId: string | null | undefined
  locatieNaam: LocatieNaamMap
}) {
  if (!locatieId) return null
  const naam = locatieNaam[locatieId]
  if (!naam) return null // gearchiveerde/onbekende locatie: geen badge tonen i.p.v. een leeg label
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded bg-sky-100 text-sky-800">
      {naam}
    </span>
  )
}
