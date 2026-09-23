# TimeCalc React

En React-version av `TimeCalc-25.xlsm` – tidrapportering med tidbank, normaltid och Rpt.Tid.
Beräkningsmotorn (`src/engine/`) är en oberoende TypeScript-implementation av arbetsbokens formler,
verifierad rad för rad mot Excels egna cachade värden (se [Tester](#tester)).

## Komma igång

Det här projektet är byggt i en sandlåda utan internetåtkomst, så `npm install` har **inte** körts eller
kunnat verifieras här. Kör följande lokalt i `~/repos/TimeCalcReact`:

```bash
npm install
npm run dev       # utvecklingsserver
npm run build     # typkontroll + produktionsbygge (dist/)
npm test          # motor- och reducer-tester (Node, ingen bundlare behövs)
```

`npm test` fungerar direkt (Node 22+ kör `.ts`-filer utan kompileringssteg). `npm run dev`/`build`
kräver att `npm install` har körts.

### Importera en ny arbetsbok

```bash
python3 scripts/import_xlsm.py ~/Documents/Arbete/TimeCalc-25.xlsm
```

Skriver `data/timecalc-<år>.json` (appens indata), `data/expected-<år>.json` (Excels cachade värden,
används bara av `tests/golden.test.ts`) och `public/seed/timecalc.json` (det appen laddar första gången).
Kräver `pip install openpyxl`. Makron körs aldrig – bara cellvärden och formler läses.

## Arkitektur

```
scripts/import_xlsm.py   xlsm -> JSON (Python, körs en gång per import)
src/engine/               ren beräkningsmotor (TS, inga React-/DOM-beroenden)
  types.ts                 datamodell (Dataset, Week, Day, …) och beräkningsresultat
  time.ts                  tidsparsning/-formatering, Excel-kompatibel avrundning
  week.ts                  motsvarar ett veckoblads formler + villkorsformateringen
  year.ts                  motsvarar Overview-bladet (löpande saldo, årssummor)
  factory.ts                tomt år, makroekvivalenter (SetupDefaultWorkLog/ClearDefaultReportTimes)
src/state/                 tillstånd: ren reducer + React-context ovanpå
  reducer.ts                (ds, action) -> ds – testas utan React
  store.tsx                 StoreProvider/useStore, håller reducern och sparar till localStorage
  storage.ts                validering, localStorage, seed-inläsning, export
src/ui/                    komponenter (App, WeekView, DayCard, ReportedTable, YearOverview, …)
tests/                     motor-, reducer- och presentationstester + golden-testet mot Excel
data/, public/seed/        genererade av import_xlsm.py, incheckas inte normalt (se .gitignore om du vill lägga till dem)
```

Motorn känner inte till React eller localStorage; all persistens och UI-logik ligger i `src/state/`
och `src/ui/`. Det gör att hela beräkningen kan testas som ren TypeScript (se `tests/`).

## Datamodellen och cellkartan

Varje veckoblad i originalet har tio dagblock à tre kolumner (G–AJ), men bara de första fem
(måndag–fredag) används någonsin – block 6–10 är helt tomma i hela arbetsboken och har uteslutits
ur modellen (importskriptet varnar om det skulle upptäcka data där).

| Begrepp i appen | Excel-cell (per dagblock, exempel för måndag) | Beskrivning |
|---|---|---|
| `Day.workday` | `G3` = "Ja" | Arbetsdag: räknas mot förväntad tid och F-kolumnen |
| `Day.forceRegistered` | `H3` = konstanten "Tid" | Loggad tid räknas även om dagen inte är arbetsdag |
| `Day.start` | `H24` | Dagens starttid |
| `Day.rows[i]` | `G25:H45` (21 rader) | Aktivitet + sluttid; varaktighet = sluttid − föregående tid |
| `Day.reported[akt]` | `I4:I20` | Manuellt rapporterade decimaltimmar per aktivitet och dag |
| `DayCalc.registered[akt]` | `H4:H21` (SUMIF) | Loggad tid för aktiviteten den dagen |
| `WeekCalc.activities[i].registered` | `E4:E21` | Loggad tid för aktiviteten under veckan |
| `WeekCalc.activities[i].reported` | `F4:F21` | Rapporterade timmar för aktiviteten under veckan |
| `WeekCalc.expectedHours` | `B23` | `38,5 × arbetsdagar / 5` |
| `WeekCalc.bankHours` / `bankDiff` | `B22` / `B24` | Summa av rapporterade timmar (bank-flaggade aktiviteter) / diff mot förväntad tid |
| `WeekCalc.normalHours` / `normalDiff` | `C22` / `C24` | Samma för normaltid-flaggan |
| `YearRow.bankBalance` | `C25` (veckoblad) / `Overview!C` | Löpande tidbankssaldo |
| `WeekCalc.registered` / `summed` / `unmapped` | `E32` / `E33` / `E34` | Total loggad tid / summerad per aktivitet / oidentifierad tid |
| `WeekCalc.reportedHours` / `reportedAsTime` | `E35` / `E36` | Rapporterade timmar totalt, omräknat till tid |
| `Activity.defaults` | `Overview!G2:X2` + kolumn A/B/C i varje veckoblad | Aktivitetsnamn och vilka summor den räknas in i |
| `Week.flags[akt]` | kolumn A/B/C i respektive veckoblad | Veckans egna flaggor (kan avvika från standard) |

Lunch (`derivedReport: true`) är ett specialfall: dess rapporterade timmar räknas inte in manuellt utan
härleds ur loggad tid (`=HOUR(H21)+MINUTE(H21)/60`, se `timeAsDecimalHours` i `time.ts`).

### Varningar (villkorsformatering)

`WeekCalc.warnings` återskapar arbetsbokens villkorsformat:

| Kod | Ursprunglig regel | Tröskel |
|---|---|---|
| `dayActivity` | `I4:I20` vs `H4:H20` | > 0,25 h |
| `dayTotal` | `I22` vs `H22` | > 0,5 h |
| `activityWeek` | `F4:F21` vs `E4:E21` | > 0,25 h |
| `rptWeek` | `F22` vs `E22` | > 0,25 h |
| `normalDiff` | `C24 ≠ 0` | ≠ 0 |
| `unmapped` | `E34 ≠ 0` | ≠ 0 |
| `regVsReported` | `E37` | > 0,5 h |
| `negativeDuration` | *(ny, fanns inte i originalet)* | Excel visar bara `####`; appen flaggar det explicit |

Alla utom `negativeDuration` är verifierade mot Excels egna villkorsformat-resultat i
`tests/golden.test.ts` (24 varningar över 20 av årets 53 veckor i den uppladdade filen).

## Kända fel i den uppladdade arbetsboken

Importskriptet upptäcker automatiskt celler där nästan alla veckoblad delar samma formel men något
blad avviker (konstant eller raderad formel), och skriver ut dem som varningar vid import. I
`TimeCalc-25.xlsm` hittades:

1. **`V17!AH3` = konstanten `24:00`** i stället för formeln `=SUM(AI4:AI21)` (ett av de oanvända
   dagblocken). Eftersom det blocket aldrig används spelar konstanten ingen roll för själva
   dagblocket, men den räknas ändå in i `E33` – Excel visar därför `E33` 24 timmar för högt och
   `E34` ("oidentifierad tid") -24:00 i stället för 0:00 för just V17. **Motorn räknar rätt** (som om
   cellen vore 0, dvs. formeln `=SUM(...)` på ett tomt block); `tests/golden.test.ts` dokumenterar
   avvikelsen explicit i `KNOWN_EXCEL_DEVIATIONS` så att testet inte tystnar om felet skulle rättas
   i arbetsboken.
2. **`V17!U31` saknar formeln** `=IF(AND(ISNUMBER(T30),ISNUMBER(T31)),T31-T30,"")` helt (cellen är
   tom). I det här fallet är kedjan runt raden redan tom i praktiken, så det har ingen mätbar effekt
   på några summor – men om rader fylldes i skulle kedjan brytas en rad tidigare än i andra veckor.
3. **`V01!B23`** använder ett bredare `COUNTIF`-intervall (`G3:AJ3`) än övriga 52 veckoblad
   (`G3:U3`). Kosmetiskt utan effekt eftersom de extra kolumnerna alltid är tomma, men värt att
   känna till om fler dagblock någonsin tas i bruk.
4. **`V12!U12`** innehåller texten `"re"` i en cell för rapporterade timmar (aktivitet "PT 160 µA").
   Excel tolkar det som `#VALUE!`-liknande och ger ingen markering; importskriptet ignorerar värdet
   och skriver ut en varning.
5. **Flagginkonsekvens**: "Förtroendeflex" har växlande bank-flagga över året och "Sjuk" har
   växlande report/normal-flaggor i ett par veckor (V05, V24). Det här är sannolikt avsiktligt
   (tillfälliga undantag en viss vecka) snarare än fel, så importen behåller flaggorna per vecka
   (`Week.flags`) i stället för att tvinga fram ett enda globalt värde.

## Tester

```bash
npm test
# eller direkt:
node --test "tests/**/*.test.ts"
```

- **`tests/golden.test.ts`** – kör motorn på den importerade arbetsboken och jämför varje tal
  (veckosummor, aktivitetsrader, dagsummor, Overview-rader, årssummor, varningar) mot Excels egna
  cachade värden. Hoppas över om `data/expected-<år>.json` saknas (kör importskriptet först).
- **`tests/engine.test.ts`** – handskrivna enhetstester för tidsparsning, Excel-kompatibel
  avrundning, kedjebrytning i tidsloggen, veckans summor/tidbank, varje varningstyp, årssaldo och
  makroekvivalenterna.
- **`tests/reducer.test.ts`** – tillståndsreducern som ren funktion (inget DOM/React krävs).
- **`tests/format.test.ts`** – datum/veckodag-formatering och att varningstexter alltid blir
  läsbara (körs mot riktiga data om de finns).

Testsviten är mutationstestad manuellt: att medvetet förstöra förväntad-tid-formeln, kedjebrytningen
i tidsloggen och hur `workday`-flaggan påverkar `E32` fick `golden.test.ts` att falera i samtliga
fall.

## Kända begränsningar

- **Ingen bundlare har körts i den här sandlådan** (`npm install`, `npm run dev`/`build` är
  overifierade här – nätverksåtkomst är avstängd). Motorn, reducern och formateringshjälparna är
  fullständigt testade och typkontrollerade i strikt läge. UI-komponenterna (`src/ui/*.tsx`) är
  typkontrollerade mot en handskriven minimal React-typstub (inte de riktiga `@types/react`), så
  verifiera gärna med `npm run build` lokalt innan du litar på dem fullt ut.
- **Sommartid/tidszoner**: alla datum hanteras som lokala kalenderdatum (ISO-strängar), inte
  tidsstämplar – det finns alltså ingen sommartidsproblematik i sig, men appen antar att veckan
  börjar på måndag oavsett tidszon.
- **Tidbankens globala flagga**: originalets `Overview` har en rad ("Till tidbank: x") som i teorin
  kan skilja sig från veckobladens egna B-flaggor. Alla 53 veckor i den uppladdade filen stämde
  exakt överens, så modellen använder bara veckobladens egna flaggor (`Week.flags`).
