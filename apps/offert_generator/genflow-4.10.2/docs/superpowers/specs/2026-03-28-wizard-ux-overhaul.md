# ConfigureWizard UX Overhaul

## Problem

Säljarna tycker att wizarden är svår att förstå. Tre huvudproblem:

1. **Allt är förvalt** — alla bilder och tjänster markeras efter scrape, det är bökigt att avmarkera
2. **Otydligt vad man ska göra** — steg-labels och instruktioner ger inte tillräcklig vägledning
3. **Bildtaggning är onödig friktion** — manuell kategorisering av bilder tar tid och ger lite mervärde

## Lösning

### Wizard: 6 steg → 5 steg

| Steg | Label (nytt) | Innehåll |
|------|-------------|----------|
| 1 | Hämta data | Auto-scrape från bokadirekt (oförändrat) |
| 2 | Välj innehåll | Välj bilder + tjänster — **inget förvalt** |
| 3 | Välj logo | Peka ut logotyp-bild (oförändrat förutom bättre instruktioner) |
| 4 | Färger | Justera färgpalett (oförändrat förutom bättre instruktioner) |
| 5 | Skapa hemsida | Auto-generering (med kö-logik om taggning inte klar) |

Steg 5 (manuell bildtaggning) tas bort. AI-taggning körs i bakgrunden istället.

### Ändring 1: Inget förvalt (bilder + tjänster)

**Fil:** `ui/src/pages/ConfigureWizard.tsx`

I `StepScrape.onDone`-callbacken (rad 798–803), ta bort raderna som gör `new Set(updated.allImages)` och `new Set(Array.from(...))`. Initiera med tomma Sets:

```tsx
// FÖRE (rad 800-802)
if (updated.allImages) setSelectedImages(new Set(updated.allImages));
const svcCount = ...;
if (svcCount > 0) setSelectedServices(new Set(Array.from({ length: svcCount }, (_, i) => i)));

// EFTER
// selectedImages och selectedServices är redan tomma Sets — gör inget
```

### Ändring 2: "Välj alla / Avmarkera alla" för bilder

Lägg till knappar ovanför bildgridet i `StepSelect`, identiska med de som redan finns för tjänster:

```tsx
<div className="flex items-center justify-between mb-3">
  <h3 className="text-sm font-medium">
    Bilder ({selectedImages.size} / {images.length} valda)
  </h3>
  <div className="flex gap-2">
    <Button variant="ghost" size="sm" className="text-xs h-6" onClick={selectAllImages}>
      Välj alla
    </Button>
    <Button variant="ghost" size="sm" className="text-xs h-6" onClick={deselectAllImages}>
      Avmarkera
    </Button>
  </div>
</div>
```

### Ändring 3: Tydliga steg-labels och instruktioner

Uppdatera `STEPS`-arrayen:

```tsx
const STEPS = [
  { label: "Hämta data", icon: "1" },
  { label: "Välj innehåll", icon: "2" },
  { label: "Välj logo", icon: "3" },
  { label: "Färger", icon: "4" },
  { label: "Skapa", icon: "5" },
];
```

Varje steg-komponent får en tydlig instruktionsrubrik längst upp:

| Steg | Rubrik | Undertext |
|------|--------|-----------|
| 1 | Hämtar företagsdata... | Vi hämtar bilder och information från bokadirekt |
| 2 | Välj vad som ska visas på hemsidan | Markera de bilder och tjänster du vill ha med |
| 3 | Vilken bild är logotypen? | (finns redan — behåll) |
| 4 | Justera färgpaletten | Färgerna är extraherade från loggan. Ändra om du vill. |
| 5 | Skapar hemsidan... | Vi bygger en unik hemsida baserat på dina val |

### Ändring 4: Större bildgrid

Ändra grid-klasserna i `StepSelect` och `StepLogo`:

```tsx
// FÖRE
className="grid grid-cols-5 sm:grid-cols-8 gap-1.5"

// EFTER
className="grid grid-cols-3 sm:grid-cols-4 gap-2"
```

Öka `IMAGES_PER_PAGE` från 12 till 8 (färre per sida, men större = lättare att se).

### Ändring 5: Bättre "Nästa"-knapp

Knappen visar vad nästa steg är, och disabled-state förklarar vad som saknas:

```tsx
// Istället för bara "Nästa"
<Button disabled={!canNext()}>
  {step === 1 && selectedImages.size === 0
    ? "Välj minst en bild för att fortsätta"
    : `Nästa: ${STEPS[step + 1]?.label}`
  }
  <ArrowRight />
</Button>
```

När disabled: knappen visar hjälptext ("Välj minst en bild...").
När enabled: knappen visar "Nästa: Välj logo".

### Ändring 6: AI-bildtaggning i bakgrunden

#### Nytt backend-endpoint

**Fil:** `server/routes/customers.js` — nytt endpoint:

```
POST /api/customers/:id/auto-tag
Body: { selectedImages: string[] }
Response: { descriptions: Array<{ filename, category, description }> }
```

Implementering:
1. Läs bilderna från `output/{slug}/bilder/`
2. Skicka varje bild (eller batch) till Claude vision API med prompten:

```
Kategorisera bilden som en av: lokal (inredning/exteriör), personal (människor/personal),
arbete (behandling/arbete i utförande), produkt (produkt/verktyg).
Ge en kort beskrivning på engelska (max 15 ord).
Svara med JSON: { "category": "...", "description": "..." }
```

3. Returnera array av `{ filename, category, description }`
4. Spara till `customer.imageDescriptions`

#### Frontend: trigger vid steg-byte

**Fil:** `ui/src/pages/ConfigureWizard.tsx`

När användaren lämnar steg 2 (trycker "Nästa"):

```tsx
const [taggingDone, setTaggingDone] = useState(false);

// Trigger vid steg 2 → 3
const handleNext = () => {
  if (step === 1) {
    // Starta AI-taggning i bakgrunden
    setTaggingDone(false);
    autoTagImages(customer.id, [...selectedImages])
      .then((result) => {
        setDescriptions(result.descriptions);
        setTaggingDone(true);
      })
      .catch(() => setTaggingDone(true)); // Fail gracefully — pipeline klarar sig utan
  }
  setStep((s) => Math.min(4, s + 1));
};
```

#### Nytt API-anrop

**Fil:** `ui/src/lib/api.ts`

```tsx
export async function autoTagImages(customerId: string, selectedImages: string[]) {
  const res = await fetch(`${API}/customers/${customerId}/auto-tag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedImages }),
  });
  if (!res.ok) throw new Error("Auto-taggning misslyckades");
  return res.json() as Promise<{ descriptions: Customer["imageDescriptions"] }>;
}
```

### Ändring 7: Kö-logik för generering

**Fil:** `ui/src/pages/ConfigureWizard.tsx` — `StepGenerate`

Om användaren når steg 5 innan taggningen är klar, visar UI:t "Skapar hemsidan..." men väntar med att anropa `generate()` tills `taggingDone === true`:

```tsx
function StepGenerate({
  customer,
  selectedImages,
  selectedServices,
  taggingDone,
}: {
  customer: Customer;
  selectedImages: string[];
  selectedServices: number[];
  taggingDone: boolean;
}) {
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (!taggingDone || started.current) return;
    started.current = true;

    (async () => {
      try {
        await generate(customer.slug, selectedImages, selectedServices, customer.id);
        navigate(`/customer/${customer.id}`);
      } catch {
        navigate(`/customer/${customer.id}`);
      }
    })();
  }, [taggingDone, customer, selectedImages, selectedServices, navigate]);

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <Loader2 className="w-10 h-10 text-violet animate-spin" />
      <p className="text-sm text-muted-foreground">
        {taggingDone ? "Startar generering..." : "Förbereder bilder..."}
      </p>
    </div>
  );
}
```

Ur användarens perspektiv ser det ut som att genereringen startade direkt. Statusmeddelandet går från "Förbereder bilder..." → "Startar generering..." → redirect till kundvy.

### Ändring 8: Ta bort "Hoppa över"-knappar

Nuvarande wizard har "Hoppa över" på steg 3-5. Ta bort dem. Logo och färger ska gå att skippa via "Nästa"-knappen direkt (de är redan valfria i `canNext()`). Att explicit visa "Hoppa över" signalerar att stegen inte är viktiga, vilket förvirrar.

## Filer som ändras

| Fil | Ändring |
|-----|---------|
| `ui/src/pages/ConfigureWizard.tsx` | Huvudändring — alla UI-förbättringar, ta bort StepTag, kö-logik |
| `ui/src/lib/api.ts` | Ny `autoTagImages()` funktion |
| `server/routes/customers.js` | Nytt `POST /auto-tag` endpoint |

## Filer som INTE ändras

- `server/routes/generate.js` — oförändrat, tar emot samma payload
- `server/lib/claude-runner.js` — oförändrat, läser `imageDescriptions` från customer-objektet som redan sparats av auto-tag
- `pipeline/brief.md` — oförändrat, konsumerar `$IMAGE_DESCRIPTIONS` oavsett källa

## Avgränsningar

- Ingen ändring av Dashboard, CustomerDetail, PrepDemo eller ReviewResult
- Ingen ändring av pipeline/genererings-logiken
- AI-taggningen är best-effort — om den misslyckas körs genereringen ändå (Claude analyserar bilderna själv som fallback, redan stödd i brief.md)
