// Vaste UI-teksten voor de WERKNEMER-facing flows (NL/TR). Drie flows zijn
// tweetalig: de toolbox-werknemerflow (/tb/[token]), het incident-meldformulier
// (/melden/[token]) en het invulscherm van de werkplekinspectie (degene die de
// inspectie op de vloer invult). De KAM/beheer-view blijft NL.
// Door de KAM ingevoerde inhoud (toolbox-tekst, quizvragen, gevolg-labels,
// checklistvragen en rubrieknamen) blijft in de taal waarin die is ingevoerd —
// die staat NIET in dit bestand.
//
// Eén centrale plek zodat de Turkse teksten in één oogopslag te reviewen/
// corrigeren zijn. Placeholders {naam}/{bedrijf} worden in de component ingevuld.
//
// ⚠️ DE TURKSE TEKSTEN ZIJN MACHINEVERTALINGEN EN NOG NIET NAGEKEKEN DOOR EEN
// MOEDERTAALSPREKER. Dit is een compliance-tool: een medewerker tekent en legt
// bevindingen vast op basis van wat hier staat. Laat een Turkstalige collega de
// `tr`-waarden nalopen vóór livegang, met bijzondere aandacht voor de
// resultaatlabels (uygun / uygun değil / geçerli değil) en voor alles wat een
// verplichting of bevestiging uitdrukt.

export type Taal = 'nl' | 'tr'
export const TALEN: { code: Taal; label: string }[] = [
  { code: 'nl', label: 'NL' },
  { code: 'tr', label: 'TR' },
]

export type Woordenboek = Record<string, { nl: string; tr: string }>

export function vertaal(dict: Woordenboek, key: string, taal: Taal): string {
  const e = dict[key]
  if (!e) return key
  return taal === 'tr' ? e.tr : e.nl
}

// Toolbox-werknemerflow (/tb/[token] → ToolboxGastClient)
export const TB_TEKST: Woordenboek = {
  toolboxen:        { nl: 'Toolboxen', tr: 'Toolbox eğitimleri' },
  hallo:            { nl: 'Hallo {naam}', tr: 'Merhaba {naam}' },
  volgJeToolboxen:  { nl: 'volg je toolboxen', tr: 'toolbox eğitimlerini tamamla' },
  geenToolboxen:    { nl: 'Er staan op dit moment geen toolboxen voor je klaar.', tr: 'Şu anda senin için hazır bir toolbox eğitimi yok.' },
  ditJaarGedaan:    { nl: '✓ Dit jaar gedaan', tr: '✓ Bu yıl yapıldı' },
  teDoen:           { nl: 'Te doen', tr: 'Yapılacak' },
  sluiten:          { nl: 'Sluiten', tr: 'Kapat' },
  alAfgerondTitel:  { nl: 'Je hebt deze toolbox dit jaar al afgerond.', tr: 'Bu toolbox eğitimini bu yıl zaten tamamladın.' },
  alAfgerondTekst:  { nl: 'Je deelname is vastgelegd en bewaard — je hoeft hem dit jaar niet opnieuw te doen. Volgend kalenderjaar staat hij weer voor je klaar.', tr: 'Katılımın kaydedildi ve saklandı — bu yıl tekrar yapmana gerek yok. Gelecek takvim yılında tekrar hazır olacak.' },
  terugOverzicht:   { nl: 'Terug naar het overzicht', tr: 'Genel görünüme dön' },
  volgendeUitleg:   { nl: '“Volgende” wordt actief zodra je de video grotendeels (≈90%) hebt bekeken. Doorspoelen mag.', tr: '"İleri" düğmesi, videoyu büyük ölçüde (≈%90) izledikten sonra etkinleşir. İleri sarabilirsin.' },
  videoBekeken:     { nl: '✓ Video bekeken.', tr: '✓ Video izlendi.' },
  videoNietAf:      { nl: 'De video kon hier niet worden afgespeeld.', tr: 'Video burada oynatılamadı.' },
  videoNietAuto:    { nl: 'Deze video kan hier niet automatisch worden afgespeeld.', tr: 'Bu video burada otomatik olarak oynatılamıyor.' },
  videoOpenInstr:   { nl: ' Open hem in een nieuw tabblad.', tr: ' Yeni bir sekmede aç.' },
  videoOpenInstrBevestig: { nl: ' Open hem in een nieuw tabblad en bevestig daarna dat je hem hebt bekeken.', tr: ' Yeni bir sekmede aç ve ardından izlediğini onayla.' },
  openVideoLink:    { nl: 'Open de video in een nieuw tabblad →', tr: 'Videoyu yeni bir sekmede aç →' },
  ikHebBekeken:     { nl: 'Ik heb de video bekeken', tr: 'Videoyu izledim' },
  volgende:         { nl: 'Volgende', tr: 'İleri' },
  goed:             { nl: '✓ Goed.', tr: '✓ Doğru.' },
  nietJuist:        { nl: '✗ Niet juist.', tr: '✗ Yanlış.' },
  nakijken:         { nl: 'Nakijken', tr: 'Kontrol et' },
  geregistreerdAls: { nl: 'Je staat geregistreerd als:', tr: 'Şu isimle kayıtlısın:' },
  kloptDit:         { nl: 'Klopt dit? Je handtekening komt straks onder déze naam te staan.', tr: 'Doğru mu? İmzan birazdan bu ismin altına eklenecek.' },
  jaDatBenIk:       { nl: 'Ja, dat ben ik', tr: 'Evet, bu benim' },
  neeNietIk:        { nl: 'Nee, dit ben ik niet', tr: 'Hayır, bu ben değilim' },
  stoppenTitel:     { nl: 'We stoppen hier.', tr: 'Burada duruyoruz.' },
  stoppenTekst:     { nl: 'Er wordt geen handtekening vastgelegd onder een naam die niet klopt. Neem contact op met je KAM-coördinator zodat je je eigen persoonlijke link krijgt.', tr: 'Doğru olmayan bir isim altında imza kaydedilmez. Kendi kişisel bağlantını alabilmen için KAM koordinatörünle iletişime geç.' },
  handtekeningUitleg: { nl: 'Zet hieronder je handtekening om te bevestigen dat je {naam} bent en deze toolbox hebt gevolgd.', tr: 'Aşağıya imzanı atarak {naam} olduğunu ve bu toolbox eğitimini tamamladığını onayla.' },
  afrondenKnop:     { nl: 'Afronden en vastleggen', tr: 'Tamamla ve kaydet' },
  bezig:            { nl: 'Bezig…', tr: 'İşleniyor…' },
  klaarBedankt:     { nl: 'Vastgelegd. Bedankt, {naam}.', tr: 'Kaydedildi. Teşekkürler, {naam}.' },
  klaarUitleg:      { nl: 'Je deelname is aantoonbaar opgeslagen en kan niet meer worden gewijzigd.', tr: 'Katılımın kanıtlanabilir şekilde kaydedildi ve artık değiştirilemez.' },
}

// Werkplekinspectie — INVULSCHERM (InspectieUitvoeren). Alleen de omringende UI.
// De checklistvragen (punt_tekst_snap), rubrieknamen, de sjabloonnaam en de
// historieregels komen uit de database in de taal waarin de KAM ze invoerde en
// worden hier bewust NIET vertaald.
//
// ⚠️ Turkse teksten: machinevertaling, nog te laten nakijken (zie kop van dit bestand).
// Let bij het nakijken vooral op `inOrde`/`nietInOrde`/`nvt`: dat zijn de labels
// waaronder een bevinding juridisch wordt vastgelegd.
export const INSP_TEKST: Woordenboek = {
  terugOverzicht:   { nl: 'Terug naar overzicht', tr: 'Genel görünüme dön' },
  inspectie:        { nl: 'Inspectie', tr: 'Denetim' },
  statusOpen:       { nl: 'open', tr: 'açık' },
  statusAfgerond:   { nl: 'afgerond', tr: 'tamamlandı' },
  statusGeannuleerd: { nl: 'geannuleerd', tr: 'iptal edildi' },
  uitgevoerdOp:     { nl: 'Uitgevoerd op {datum}', tr: '{datum} tarihinde yapıldı' },
  laden:            { nl: 'Laden…', tr: 'Yükleniyor…' },
  geenPunten:       { nl: 'Dit sjabloon had geen punten. Voeg punten toe en start een nieuwe inspectie.', tr: 'Bu şablonda madde yok. Madde ekle ve yeni bir denetim başlat.' },

  conclusie:        { nl: 'Conclusie', tr: 'Sonuç' },
  conclusiePlaceholder: { nl: 'Algemene conclusie of opmerking…', tr: 'Genel sonuç veya not…' },

  // NL kent enkelvoud/meervoud, Turks gebruikt na een telwoord het enkelvoud.
  verplichtOpenEnk: { nl: '{n} verplicht punt nog zonder resultaat.', tr: '{n} zorunlu madde henüz sonuçsuz.' },
  verplichtOpenMv:  { nl: '{n} verplichte punten nog zonder resultaat.', tr: '{n} zorunlu madde henüz sonuçsuz.' },
  afronden:         { nl: 'Inspectie afronden', tr: 'Denetimi tamamla' },
  bezig:            { nl: 'Bezig…', tr: 'İşleniyor…' },
  afrondenMislukt:  { nl: 'Afronden mislukt: ', tr: 'Tamamlama başarısız: ' },
  onbekendeFout:    { nl: 'onbekende fout', tr: 'bilinmeyen hata' },

  geschiedenis:     { nl: 'Geschiedenis', tr: 'Geçmiş' },
  geenGeschiedenis: { nl: 'Nog geen geschiedenis.', tr: 'Henüz geçmiş yok.' },

  inOrde:           { nl: 'In orde', tr: 'Uygun' },
  nietInOrde:       { nl: 'Niet in orde', tr: 'Uygun değil' },
  nvt:              { nl: 'N.v.t.', tr: 'Geçerli değil' },
  verplicht:        { nl: 'Verplicht', tr: 'Zorunlu' },

  hoeAfgehandeld:   { nl: 'Hoe is dit afgehandeld?', tr: 'Bu nasıl giderildi?' },
  // Om de link midden in de zin te houden: voor- en achterstuk apart. De
  // woordvolgorde verschilt (NL: "op de actielijst.", TR: "aksiyon listesinde yer alıyor.").
  actiePrefix:      { nl: '✓ Er staat een actie op de ', tr: '✓ Bir görev ' },
  actielijst:       { nl: 'actielijst', tr: 'aksiyon listesinde' },
  actieSuffix:      { nl: '.', tr: ' yer alıyor.' },

  toelichtingPlaceholder: { nl: 'Toelichting (verplicht bij ‘meteen hersteld’)…', tr: 'Açıklama (‘hemen giderildi’ için zorunlu)…' },
  meteenHersteld:   { nl: 'Meteen hersteld', tr: 'Hemen giderildi' },
  actieAanmaken:    { nl: 'Actie aanmaken', tr: 'Görev oluştur' },
  opmerkingPlaceholder: { nl: 'Opmerking (optioneel)…', tr: 'Not (isteğe bağlı)…' },
  directHersteld:   { nl: 'Direct hersteld — {opmerking}', tr: 'Hemen giderildi — {opmerking}' },

  foutToelichtingVerplicht: { nl: 'Een toelichting is verplicht bij ‘meteen hersteld’.', tr: '‘Hemen giderildi’ için açıklama zorunludur.' },
  foutOpslaan:      { nl: 'Opslaan mislukt', tr: 'Kaydetme başarısız' },
  foutActie:        { nl: 'Actie aanmaken mislukt', tr: 'Görev oluşturulamadı' },
}

// Incident-meldformulier (/melden/[token] → IncidentMeldClient)
export const MELD_TEKST: Woordenboek = {
  titel:            { nl: 'Incident of bijna-incident melden', tr: 'Olay veya ramak kala bildirimi' },
  meldingFallback:  { nl: 'Melding', tr: 'Bildirim' },
  subStaart:        { nl: '— kort en simpel. Je hoeft niet in te loggen.', tr: '— kısa ve basit. Giriş yapmana gerek yok.' },
  datum:            { nl: 'Datum', tr: 'Tarih' },
  tijd:             { nl: 'Tijd', tr: 'Saat' },
  locatie:          { nl: 'Locatie', tr: 'Konum' },
  locatiePlaceholder: { nl: 'Waar gebeurde het?', tr: 'Nerede oldu?' },
  project:          { nl: 'Project', tr: 'Proje' },
  optioneel:        { nl: '(optioneel)', tr: '(isteğe bağlı)' },
  projectPlaceholder: { nl: 'Project of opdracht', tr: 'Proje veya iş' },
  watGebeurd:       { nl: 'Wat is er gebeurd?', tr: 'Ne oldu?' },
  omschrijvingPlaceholder: { nl: 'Beschrijf kort wat er gebeurde', tr: 'Ne olduğunu kısaca açıkla' },
  gevolgVraag:      { nl: 'Wat was het gevolg?', tr: 'Sonucu neydi?' },
  meerdereMogelijk: { nl: '(meerdere mogelijk)', tr: '(birden fazla seçilebilir)' },
  jeNaam:           { nl: 'Je naam', tr: 'Adın' },
  naamPlaceholder:  { nl: 'Mag je leeglaten', tr: 'Boş bırakabilirsin' },
  fotos:            { nl: 'Foto’s', tr: 'Fotoğraflar' },
  verwijderFoto:    { nl: 'Verwijder foto', tr: 'Fotoğrafı sil' },
  fotoToevoegen:    { nl: 'Foto toevoegen', tr: 'Fotoğraf ekle' },
  versturen:        { nl: 'Melding versturen', tr: 'Bildirimi gönder' },
  versturenBezig:   { nl: 'Bezig met versturen…', tr: 'Gönderiliyor…' },
  foutLocatie:      { nl: 'Vul de locatie in.', tr: 'Konumu gir.' },
  foutOmschrijving: { nl: 'Omschrijf kort wat er is gebeurd.', tr: 'Ne olduğunu kısaca açıkla.' },
  foutDatum:        { nl: 'Vul de datum in.', tr: 'Tarihi gir.' },
  foutVersturen:    { nl: 'Melding versturen mislukt.', tr: 'Bildirim gönderilemedi.' },
  foutAlgemeen:     { nl: 'Er ging iets mis. Probeer het opnieuw.', tr: 'Bir şeyler ters gitti. Tekrar dene.' },
  foutFotoUpload:   { nl: 'Foto uploaden mislukt.', tr: 'Fotoğraf yüklenemedi.' },
  foutFotoVastleggen: { nl: 'Foto vastleggen mislukt.', tr: 'Fotoğraf kaydedilemedi.' },
  klaarTitel:       { nl: 'Bedankt, je melding is doorgegeven', tr: 'Teşekkürler, bildirimin iletildi' },
  klaarTekst:       { nl: 'De VGM-coördinator{bedrijf} neemt het van hier over. Je hoeft verder niets te doen.', tr: 'İSG koordinatörü{bedrijf} buradan devralır. Başka bir şey yapmana gerek yok.' },
}
