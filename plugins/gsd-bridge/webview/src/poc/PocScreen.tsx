import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Label,
  RadioGroup,
  RadioGroupItem,
  Separator,
} from './shadcn-primitives';
import { POC_DESCRIPTOR, pocInitialSelections, type PocCard } from './poc-spec';

// =====================================================================
// PocScreen — Plan 04-05 v2 refactor (2026-04-24).
//
// Shadcn-only POC: 4 Cards with stock shadcn RadioGroups, one Checkbox for
// the --auto flag, a Separator, and Submit / Reset buttons. All rendering
// happens in React directly (no <Renderer>) so interactions update state
// immediately — user clicks a radio, the selection moves; toggles the
// checkbox, it flips; clicks Reset, everything clears.
//
// Host-injected specs are unaffected: `app.tsx` routes them through
// `<Renderer>` with the json-render registry. This component only renders
// in the no-host fallback path.
//
// Submit / Reset routing contract (unchanged from v1):
//   - `window.__gsdSubmit(payload)` — called with the structured selection
//     payload; in dev mode (no host) a console.log serves as the fallback.
//   - `window.__gsdReset()` — called on Reset click; local state always
//     clears first so the UI reflects the reset immediately whether or not
//     a host is listening.
//   - `window.__gsdPayloadProvider` — kept registered so the Plan 04-03
//     GsdButtonOverride still has a provider to query if a host spec
//     happens to render a Button with action="submit" alongside the POC
//     (unlikely in the current app.tsx flow, but preserves the contract).
// =====================================================================

interface SubmitPayload {
  action: 'submit';
  selections: Record<PocCard['id'], string>;
  selections_flat: Array<{ card: string; value: string; label: string }>;
  auto: boolean;
  ts: string;
}

function assemblePayload(
  selections: Record<PocCard['id'], string>,
  auto: boolean,
): SubmitPayload {
  const flat = POC_DESCRIPTOR.cards.map((card) => {
    const value = selections[card.id];
    const option = card.options.find((o) => o.value === value);
    return {
      card: card.title,
      value,
      label: option ? option.label : '(unknown)',
    };
  });
  return {
    action: 'submit',
    selections: { ...selections },
    selections_flat: flat,
    auto,
    ts: new Date().toISOString(),
  };
}

export function PocScreen() {
  const [selections, setSelections] = useState<Record<PocCard['id'], string>>(
    () => pocInitialSelections(),
  );
  const [autoFlag, setAutoFlag] = useState<boolean>(POC_DESCRIPTOR.autoFlag.defaultChecked);
  const [submitted, setSubmitted] = useState<SubmitPayload | null>(null);

  const handleReset = useCallback(() => {
    setSelections(pocInitialSelections());
    setAutoFlag(POC_DESCRIPTOR.autoFlag.defaultChecked);
    setSubmitted(null);
    if (typeof window !== 'undefined' && typeof window.__gsdReset === 'function') {
      try {
        window.__gsdReset();
      } catch {
        /* swallow — host handles its own errors */
      }
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const payload = assemblePayload(selections, autoFlag);
    setSubmitted(payload);
    if (typeof window === 'undefined') return;
    if (typeof window.__gsdSubmit === 'function') {
      try {
        void window.__gsdSubmit(payload);
      } catch {
        /* swallow — host surfaces its own errors */
      }
    } else {
      console.log('[gsd] action submit fired (no host)', payload);
    }
  }, [selections, autoFlag]);

  // Payload provider contract (Plan 04-03) — kept registered so any host-side
  // Button override pathway can still ask the POC for the current payload.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__gsdPayloadProvider = () => assemblePayload(selections, autoFlag);
    return () => {
      if (window.__gsdPayloadProvider) delete window.__gsdPayloadProvider;
    };
  }, [selections, autoFlag]);

  const cards = useMemo(() => POC_DESCRIPTOR.cards, []);

  return (
    <section
      data-testid="poc-screen"
      className="mx-auto max-w-4xl space-y-6 p-6 text-foreground"
    >
      <header className="space-y-2" data-testid="poc-banner">
        <h1 className="text-2xl font-semibold tracking-tight">{POC_DESCRIPTOR.banner.stage}</h1>
        <p className="text-sm text-muted-foreground">{POC_DESCRIPTOR.banner.tagline}</p>
      </header>

      <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        data-testid="poc-cards-grid"
      >
        {cards.map((card) => (
          <Card key={card.id} data-testid={`poc-${card.id}`}>
            <CardHeader>
              <CardTitle>{card.title}</CardTitle>
              {card.description ? (
                <CardDescription>{card.description}</CardDescription>
              ) : null}
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={selections[card.id]}
                onValueChange={(next) =>
                  setSelections((prev) => ({ ...prev, [card.id]: next }))
                }
                aria-label={card.title}
                data-testid={`poc-${card.id}-radiogroup`}
              >
                {card.options.map((option) => {
                  const inputId = `${card.id}-${option.value}`;
                  return (
                    <div key={option.value} className="flex items-start space-x-2">
                      <RadioGroupItem
                        value={option.value}
                        id={inputId}
                        data-testid={`poc-${card.id}-option-${option.value}`}
                      />
                      <div className="grid gap-1 leading-none">
                        <Label htmlFor={inputId} className="cursor-pointer">
                          {option.label}
                        </Label>
                        {option.notes ? (
                          <p className="text-xs text-muted-foreground">{option.notes}</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </RadioGroup>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      <div className="flex items-start space-x-2" data-testid="poc-auto-flag">
        <Checkbox
          id="poc-auto"
          checked={autoFlag}
          onCheckedChange={(next) => setAutoFlag(next === true)}
          data-testid="poc-auto-checkbox"
        />
        <div className="grid gap-1 leading-none">
          <Label htmlFor="poc-auto" className="cursor-pointer">
            {POC_DESCRIPTOR.autoFlag.label}
          </Label>
          <p className="text-xs text-muted-foreground">
            {POC_DESCRIPTOR.autoFlag.description}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3" data-testid="poc-actions">
        <Button
          variant={POC_DESCRIPTOR.actions.submit.variant}
          onClick={handleSubmit}
          data-testid="poc-submit"
        >
          {POC_DESCRIPTOR.actions.submit.label}
        </Button>
        <Button
          variant={POC_DESCRIPTOR.actions.reset.variant}
          onClick={handleReset}
          data-testid="poc-reset"
        >
          {POC_DESCRIPTOR.actions.reset.label}
        </Button>
      </div>

      {submitted ? (
        <Card data-testid="poc-submitted-marker" className="bg-muted">
          <CardHeader>
            <CardTitle className="text-sm">Submitted payload</CardTitle>
            <CardDescription>
              Sent to window.__gsdSubmit (or logged to console in dev mode).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md bg-background p-3 text-xs">
              <code>{JSON.stringify(submitted, null, 2)}</code>
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
