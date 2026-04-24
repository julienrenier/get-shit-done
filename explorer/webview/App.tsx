import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import {
  JSONUIProvider,
  Renderer,
  defineRegistry,
  useStateStore,
} from "@json-render/react";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { shadcnComponents } from "@json-render/shadcn";
import {
  createPanel,
  createEventStore,
  createSelectionBus,
  specTab,
  stateTab,
  catalogTab,
  streamTab,
  actionsTab,
  pickerTab,
} from "@json-render/devtools";

type GrayArea = { label: string; questions: string[]; annotation?: string };
type AnalysisOption = { name: string; pros: string[]; cons: string[] };
type Analysis = {
  area: string;
  options: AnalysisOption[];
  recommendation: { option: string; rationale: string; cites: string[] };
  generic?: boolean;
};
type DiscussionRecord = {
  phase?: string;
  domain?: string;
  paths?: { phase_dir: string; padded_phase: string; phase_slug: string };
  gray_areas: GrayArea[];
  analysis?: Analysis[];
};
type AdvisorRequest = {
  area: string;
  requested_at: string;
  status: "pending" | "running" | "done";
};
type ChatMessage = { role: "user" | "assistant"; content: string; at: string };
type ChatSession = {
  area: string;
  messages: ChatMessage[];
  status: "idle" | "thinking" | "waiting_user" | "done";
};
type ScoreResponse = {
  score: number;
  verdict: "continue" | "undecided" | "ready";
  signals: { rounds: number };
  suggestion: string;
} | null;

const catalog = defineCatalog(schema, {
  components: {
    // Layout (4)
    Card: shadcnComponentDefinitions.Card,
    Stack: shadcnComponentDefinitions.Stack,
    Grid: shadcnComponentDefinitions.Grid,
    Separator: shadcnComponentDefinitions.Separator,
    // Navigation (4)
    Tabs: shadcnComponentDefinitions.Tabs,
    Accordion: shadcnComponentDefinitions.Accordion,
    Collapsible: shadcnComponentDefinitions.Collapsible,
    Pagination: shadcnComponentDefinitions.Pagination,
    // Overlay (5)
    Dialog: shadcnComponentDefinitions.Dialog,
    Drawer: shadcnComponentDefinitions.Drawer,
    Tooltip: shadcnComponentDefinitions.Tooltip,
    Popover: shadcnComponentDefinitions.Popover,
    DropdownMenu: shadcnComponentDefinitions.DropdownMenu,
    // Content (8)
    Heading: shadcnComponentDefinitions.Heading,
    Text: shadcnComponentDefinitions.Text,
    Image: shadcnComponentDefinitions.Image,
    Avatar: shadcnComponentDefinitions.Avatar,
    Badge: shadcnComponentDefinitions.Badge,
    Alert: shadcnComponentDefinitions.Alert,
    Carousel: shadcnComponentDefinitions.Carousel,
    Table: shadcnComponentDefinitions.Table,
    // Feedback (3)
    Progress: shadcnComponentDefinitions.Progress,
    Skeleton: shadcnComponentDefinitions.Skeleton,
    Spinner: shadcnComponentDefinitions.Spinner,
    // Input (12)
    Button: shadcnComponentDefinitions.Button,
    Link: shadcnComponentDefinitions.Link,
    Input: shadcnComponentDefinitions.Input,
    Textarea: shadcnComponentDefinitions.Textarea,
    Select: shadcnComponentDefinitions.Select,
    Checkbox: shadcnComponentDefinitions.Checkbox,
    Radio: shadcnComponentDefinitions.Radio,
    Switch: shadcnComponentDefinitions.Switch,
    Slider: shadcnComponentDefinitions.Slider,
    Toggle: shadcnComponentDefinitions.Toggle,
    ToggleGroup: shadcnComponentDefinitions.ToggleGroup,
    ButtonGroup: shadcnComponentDefinitions.ButtonGroup,
  },
  actions: {
    selectArea: {
      params: z.object({ label: z.string() }),
      description: "Select a gray area to show in the detail pane",
    },
    triggerAdvisor: {
      params: z.object({ label: z.string() }),
      description: "Queue an advisor research request for the given area",
    },
    sendChat: {
      params: z.object({ label: z.string() }),
      description: "Send the current chatInput state as a user message to the area's chat session",
    },
    closeChat: {
      params: z.object({ label: z.string() }),
      description: "Mark the chat session as done",
    },
    switchView: {
      params: z.object({ view: z.enum(["areas", "options"]) }),
      description: "Switch the main view between area detail and json-render options picker",
    },
    voteOption: {
      params: z.object({
        id: z.string(),
        vote: z.enum(["approved", "rejected", "undecided"]),
      }),
      description: "Vote on a json-render option (approved / rejected / undecided)",
    },
  },
});

type JsonRenderOption = {
  id: string;
  group: string;
  groupTitle: string;
  title: string;
  description: string;
  usage: string;
  cost: "S" | "M" | "L";
  vote: "approved" | "rejected" | "undecided";
};

type Props = {
  state: DiscussionRecord | null;
  score: ScoreResponse;
  queue: AdvisorRequest[];
  chats: ChatSession[];
  options: JsonRenderOption[];
  selected: string | null;
  view: "areas" | "options";
  online: boolean;
};

function buildSpec(p: Props) {
  const elements: Record<string, any> = {};
  const areas = p.state?.gray_areas ?? [];
  const currentLabel = p.selected ?? areas[0]?.label ?? null;
  const currentArea = areas.find((a) => a.label === currentLabel);
  const currentAnalysis = p.state?.analysis?.find((a) => a.area === currentLabel);
  const currentStatus = p.queue.find((q) => q.area === currentLabel)?.status;
  const currentChat = p.chats.find((c) => c.area === currentLabel);

  // ── GLOBAL TOP BAR (offline banner) ───────────────────────────────────
  const topChildren: string[] = [];
  if (!p.online) {
    elements["offlineAlert"] = {
      type: "Alert",
      props: {
        type: "error",
        title: "Connexion perdue",
        message: "Impossible de joindre le serveur explorer. Vérifie que le process est vivant sur :4300.",
      },
      children: [],
    };
    topChildren.push("offlineAlert");
  }

  // ── LEFT SIDEBAR ──────────────────────────────────────────────────────
  const sidebarBtnKeys: string[] = [];
  areas.forEach((a, i) => {
    const k = `sb-${i}`;
    const qStatus = p.queue.find((q) => q.area === a.label)?.status;
    const enriched = !!p.state?.analysis?.find((x) => x.area === a.label && !x.generic);
    const suffix = qStatus === "running" ? " · …" : qStatus === "pending" ? " · file" : enriched ? " · ✓" : "";
    elements[k] = {
      type: "Button",
      props: {
        label: a.label + suffix,
        variant: a.label === currentLabel ? "primary" : "secondary",
        disabled: false,
      },
      on: { press: { action: "selectArea", params: { label: a.label } } },
      children: [],
    };
    sidebarBtnKeys.push(k);
  });

  elements["sbTitle"] = { type: "Heading", props: { level: "h4", text: "zones grises" }, children: [] };
  elements["sbStatus"] = {
    type: "Text",
    props: {
      variant: "caption",
      text:
        (p.online ? "● " : "○ ") +
        (p.state?.paths ? `phase ${p.state.paths.padded_phase}` : "—") +
        ` · ${areas.length} areas` +
        (p.score ? ` · tour ${p.score.signals.rounds}` : ""),
    },
    children: [],
  };

  // View switcher (zones grises / options json-render)
  elements["sbViewAreas"] = {
    type: "Button",
    props: {
      label: "Zones grises",
      variant: p.view === "areas" ? "primary" : "secondary",
      disabled: false,
    },
    on: { press: { action: "switchView", params: { view: "areas" } } },
    children: [],
  };
  elements["sbViewOptions"] = {
    type: "Button",
    props: {
      label: `Options json-render (${p.options.filter((o) => o.vote === "approved").length}✓/${p.options.length})`,
      variant: p.view === "options" ? "primary" : "secondary",
      disabled: false,
    },
    on: { press: { action: "switchView", params: { view: "options" } } },
    children: [],
  };
  elements["sbViewSwitcher"] = {
    type: "Stack",
    props: { direction: "vertical", gap: "sm" },
    children: ["sbViewAreas", "sbViewOptions"],
  };

  const sidebarChildren: string[] = ["sbTitle", "sbStatus", "sbViewSwitcher", "sep-sb"];
  elements["sep-sb"] = { type: "Separator", props: { orientation: "horizontal" }, children: [] };

  if (p.state === null) {
    // Boot state — render skeletons instead of empty list
    const skelKeys: string[] = [];
    for (let i = 0; i < 4; i++) {
      const k = `skel-${i}`;
      elements[k] = {
        type: "Skeleton",
        props: { width: "100%", height: "2rem", rounded: false },
        children: [],
      };
      skelKeys.push(k);
    }
    elements["sbSkelStack"] = {
      type: "Stack",
      props: { direction: "vertical", gap: "sm" },
      children: skelKeys,
    };
    sidebarChildren.push("sbSkelStack");
  } else {
    elements["sbBtns"] = {
      type: "Stack",
      props: { direction: "vertical", gap: "sm" },
      children: sidebarBtnKeys,
    };
    sidebarChildren.push("sbBtns");

    // Pagination affordance only if list is long enough
    if (areas.length >= 10) {
      const totalPages = Math.ceil(areas.length / 10);
      elements["sbPagination"] = {
        type: "Pagination",
        props: { totalPages, page: 1 },
        children: [],
      };
      sidebarChildren.push("sbPagination");
    }
  }

  elements["sidebar"] = {
    type: "Card",
    props: { maxWidth: "md", title: "explorer" },
    children: sidebarChildren,
  };

  // ── MAIN — options picker view (if view === "options") ────────────────
  if (p.view === "options") {
    // Group options by letter
    const byGroup = new Map<string, JsonRenderOption[]>();
    for (const o of p.options) {
      const arr = byGroup.get(o.group) ?? [];
      arr.push(o);
      byGroup.set(o.group, arr);
    }
    const approved = p.options.filter((o) => o.vote === "approved").length;
    const rejected = p.options.filter((o) => o.vote === "rejected").length;
    const undecided = p.options.length - approved - rejected;

    elements["optHeader"] = {
      type: "Alert",
      props: {
        type: "info",
        title: "Valide les options json-render à câbler dans l'explorer",
        message: `${approved} approuvées · ${rejected} rejetées · ${undecided} à traiter (${p.options.length} total).`,
      },
      children: [],
    };

    const accordionKeys: string[] = [];
    const groupOrder = Array.from(byGroup.keys()).sort();
    for (const group of groupOrder) {
      const opts = byGroup.get(group)!;
      const groupApproved = opts.filter((o) => o.vote === "approved").length;
      const optionCardKeys: string[] = [];

      for (const o of opts) {
        const approveK = `opt-${o.id}-approve`;
        const rejectK = `opt-${o.id}-reject`;
        const undoK = `opt-${o.id}-undo`;
        const titleK = `opt-${o.id}-title`;
        const descK = `opt-${o.id}-desc`;
        const usageK = `opt-${o.id}-usage`;
        const costK = `opt-${o.id}-cost`;
        const voteK = `opt-${o.id}-vote`;
        const actionsK = `opt-${o.id}-actions`;
        const cardK = `opt-${o.id}-card`;

        elements[titleK] = {
          type: "Heading",
          props: { level: "h5", text: `${o.id} · ${o.title}` },
          children: [],
        };
        elements[costK] = {
          type: "Badge",
          props: {
            text: `coût ${o.cost}`,
            variant: o.cost === "S" ? "secondary" : o.cost === "M" ? "outline" : "default",
          },
          children: [],
        };
        elements[voteK] = {
          type: "Badge",
          props: {
            text:
              o.vote === "approved"
                ? "✓ validé"
                : o.vote === "rejected"
                  ? "✗ rejeté"
                  : "à décider",
            variant:
              o.vote === "approved"
                ? "default"
                : o.vote === "rejected"
                  ? "destructive"
                  : "outline",
          },
          children: [],
        };
        elements[descK] = {
          type: "Text",
          props: { variant: "body", text: o.description },
          children: [],
        };
        elements[usageK] = {
          type: "Text",
          props: { variant: "muted", text: `Usage explorer : ${o.usage}` },
          children: [],
        };
        elements[approveK] = {
          type: "Button",
          props: {
            label: o.vote === "approved" ? "✓ validée" : "Valider",
            variant: o.vote === "approved" ? "primary" : "secondary",
            disabled: false,
          },
          on: {
            press: { action: "voteOption", params: { id: o.id, vote: "approved" } },
          },
          children: [],
        };
        elements[rejectK] = {
          type: "Button",
          props: {
            label: o.vote === "rejected" ? "✗ rejetée" : "Rejeter",
            variant: o.vote === "rejected" ? "danger" : "secondary",
            disabled: false,
          },
          on: {
            press: { action: "voteOption", params: { id: o.id, vote: "rejected" } },
          },
          children: [],
        };
        elements[undoK] = {
          type: "Button",
          props: {
            label: "Reset",
            variant: "secondary",
            disabled: o.vote === "undecided",
          },
          on: {
            press: { action: "voteOption", params: { id: o.id, vote: "undecided" } },
          },
          children: [],
        };
        elements[actionsK] = {
          type: "Stack",
          props: { direction: "horizontal", gap: "sm" },
          children: [approveK, rejectK, undoK],
        };
        elements[`opt-${o.id}-meta`] = {
          type: "Stack",
          props: { direction: "horizontal", gap: "sm" },
          children: [costK, voteK],
        };
        elements[cardK] = {
          type: "Card",
          props: {
            title: `${o.id} · ${o.title}`,
            description: `coût ${o.cost}`,
          },
          children: [descK, usageK, `opt-${o.id}-meta`, actionsK],
        };
        optionCardKeys.push(cardK);
      }

      const groupStackK = `group-${group}-stack`;
      elements[groupStackK] = {
        type: "Stack",
        props: { direction: "vertical", gap: "md" },
        children: optionCardKeys,
      };

      const groupWrapK = `group-${group}-wrap`;
      elements[groupWrapK] = {
        type: "Card",
        props: {
          title: `${group} · ${opts[0].groupTitle}`,
          description: `${groupApproved}/${opts.length} validées`,
        },
        children: [groupStackK],
      };
      accordionKeys.push(groupWrapK);
    }

    elements["optionsStack"] = {
      type: "Stack",
      props: { direction: "vertical", gap: "lg" },
      children: ["optHeader", ...accordionKeys],
    };
    elements["main"] = {
      type: "Stack",
      props: { direction: "vertical", gap: "md" },
      children: ["optionsStack"],
    };
    elements["root"] = {
      type: "Stack",
      props: { direction: "horizontal", gap: "lg", align: "start" },
      children: ["sidebar", "main"],
    };
    return { root: "root", elements };
  }

  // ── MAIN DETAIL ───────────────────────────────────────────────────────
  const mainChildren: string[] = [];

  if (p.state === null) {
    // Boot — main area skeleton
    elements["mainSkel1"] = {
      type: "Skeleton",
      props: { width: "60%", height: "2rem", rounded: false },
      children: [],
    };
    elements["mainSkel2"] = {
      type: "Skeleton",
      props: { width: "100%", height: "8rem", rounded: false },
      children: [],
    };
    elements["mainSkel3"] = {
      type: "Skeleton",
      props: { width: "80%", height: "4rem", rounded: false },
      children: [],
    };
    elements["mainSkelCard"] = {
      type: "Card",
      props: { title: "chargement…", description: null, maxWidth: null, centered: null, className: null },
      children: ["mainSkel1", "mainSkel2", "mainSkel3"],
    };
    mainChildren.push("mainSkelCard");
  } else if (p.score) {
    // Score block — Progress bar + contextual Alert + suggestion text
    const alertType =
      p.score.verdict === "ready" ? "success" : p.score.verdict === "continue" ? "info" : "warning";
    elements["scoreProgress"] = {
      type: "Progress",
      props: {
        value: p.score.score,
        max: 100,
        label: `Score de décision : ${p.score.score}/100`,
      },
      children: [],
    };
    elements["scoreVerdictAlert"] = {
      type: "Alert",
      props: {
        type: alertType,
        title: `Verdict : ${p.score.verdict.toUpperCase()}`,
        message: p.score.suggestion,
      },
      children: [],
    };
    elements["scoreCard"] = {
      type: "Card",
      props: { title: "thinking partner", description: `tour ${p.score.signals.rounds}`, maxWidth: null, centered: null, className: null },
      children: ["scoreProgress", "scoreVerdictAlert"],
    };
    mainChildren.push("scoreCard");
  }

  if (currentArea) {
    const detailChildren: string[] = [];

    // Questions
    currentArea.questions.forEach((q, qi) => {
      const k = `q-${qi}`;
      elements[k] = { type: "Text", props: { variant: "body", text: q }, children: [] };
      detailChildren.push(k);
    });

    // Long annotation wrapped in Collapsible
    if (currentArea.annotation) {
      elements["annotText"] = {
        type: "Text",
        props: { variant: "muted", text: currentArea.annotation },
        children: [],
      };
      elements["annotCollapsible"] = {
        type: "Collapsible",
        props: { title: "Voir l'annotation complète", defaultOpen: false },
        children: ["annotText"],
      };
      detailChildren.push("annotCollapsible");
    }

    // Trade-off analysis — inline directly in the detail Card (no Accordion wrapper)
    if (currentAnalysis) {
      const tableRows = currentAnalysis.options.map((o) => [
        o.name,
        o.pros.join(" · ") || "—",
        o.cons.join(" · ") || "—",
      ]);
      elements["tradeoffTable"] = {
        type: "Table",
        props: {
          columns: ["Option", "Pour", "Contre"],
          rows: tableRows,
          caption: "Trade-off par option",
        },
        children: [],
      };
      elements["recoAlert"] = {
        type: "Alert",
        props: {
          type: "success",
          title: `Recommandation : ${currentAnalysis.recommendation.option}`,
          message:
            currentAnalysis.recommendation.rationale +
            (currentAnalysis.recommendation.cites.length
              ? ` (réfs : ${currentAnalysis.recommendation.cites.join(", ")})`
              : ""),
        },
        children: [],
      };

      // Dense case (>3 options) : wrap table in Collapsible open-by-default so user can fold it if needed.
      // Otherwise render table inline unconditionally.
      if (currentAnalysis.options.length > 3) {
        elements["tradeoffCollapsible"] = {
          type: "Collapsible",
          props: {
            title: `Analyse comparative (${currentAnalysis.options.length} options)`,
            defaultOpen: true,
          },
          children: ["tradeoffTable"],
        };
        detailChildren.push("tradeoffCollapsible", "recoAlert");
      } else {
        detailChildren.push("tradeoffTable", "recoAlert");
      }

      if (currentAnalysis.generic) {
        elements["genBadge"] = {
          type: "Badge",
          props: { text: "générique · pré-scout", variant: "outline" },
          children: [],
        };
        detailChildren.push("genBadge");
      }
    }

    // Advisor running — inline Spinner + Badge
    if (currentStatus === "running") {
      elements["advSpinner"] = {
        type: "Spinner",
        props: { size: "sm", label: "advisor en cours d'analyse…" },
        children: [],
      };
      detailChildren.push("advSpinner");
    }

    if (currentStatus) {
      const badgeVariant =
        currentStatus === "pending"
          ? "secondary"
          : currentStatus === "running"
            ? "secondary"
            : "default";
      elements["statusBadge"] = {
        type: "Badge",
        props: {
          text:
            currentStatus === "pending"
              ? "advisor en file"
              : currentStatus === "running"
                ? "advisor en cours"
                : "enrichi",
          variant: badgeVariant,
        },
        children: [],
      };
      detailChildren.push("statusBadge");
    }

    // Advisor trigger button + Tooltip affordance
    elements["advBtn"] = {
      type: "Button",
      props: {
        label: currentStatus === "running" ? "advisor en cours…" : "déclencher advisor",
        variant: "primary",
        disabled: currentStatus === "pending" || currentStatus === "running",
      },
      on: { press: { action: "triggerAdvisor", params: { label: currentArea.label } } },
      children: [],
    };
    elements["advTooltip"] = {
      type: "Tooltip",
      props: {
        text: "aide",
        content:
          "Déclenche une recherche externe pour enrichir cette zone grise avec une analyse trade-off concrète.",
      },
      children: [],
    };

    // DropdownMenu for secondary area actions (placeholder — dispatches to selectArea for re-focus).
    elements["areaActionsMenu"] = {
      type: "DropdownMenu",
      props: {
        label: "actions",
        items: [
          { label: "Re-focus cette area", value: "refocus" },
          { label: "Marquer décidée", value: "mark-decided" },
          { label: "Reporter (defer)", value: "defer" },
          { label: "Reset analysis", value: "reset" },
        ],
        value: null,
      },
      children: [],
    };

    elements["advRow"] = {
      type: "Stack",
      props: { direction: "horizontal", gap: "sm", align: "center" },
      children: ["advBtn", "advTooltip", "areaActionsMenu"],
    };
    detailChildren.push("advRow");

    elements["detail"] = {
      type: "Card",
      props: { title: currentArea.label, description: p.state?.domain ?? "" },
      children: detailChildren,
    };
    mainChildren.push("detail");
  } else if (p.state !== null) {
    elements["empty"] = {
      type: "Alert",
      props: {
        type: "info",
        title: "Aucune zone grise",
        message: "Envoie un payload via mcp__explorer__submit_discussion pour commencer.",
      },
      children: [],
    };
    mainChildren.push("empty");
  }
  elements["main"] = {
    type: "Stack",
    props: { direction: "vertical", gap: "md" },
    children: mainChildren,
  };

  // ── RIGHT CHAT SIDEBAR ────────────────────────────────────────────────
  const chatChildren: string[] = [];

  if (currentArea) {
    const statusText =
      currentChat?.status === "thinking"
        ? "l'agent réfléchit…"
        : currentChat?.status === "waiting_user"
          ? "à toi de répondre"
          : currentChat?.status === "done"
            ? "session close"
            : "pas de session — envoie un message pour démarrer";

    // Status badge (variant reflects state)
    const chatBadgeVariant =
      currentChat?.status === "done"
        ? "outline"
        : currentChat?.status === "thinking"
          ? "secondary"
          : currentChat?.status === "waiting_user"
            ? "default"
            : "outline";
    elements["chatStatusBadge"] = {
      type: "Badge",
      props: { text: statusText, variant: chatBadgeVariant },
      children: [],
    };
    chatChildren.push("chatStatusBadge");

    // Inline Spinner when thinking
    if (currentChat?.status === "thinking") {
      elements["chatSpinner"] = {
        type: "Spinner",
        props: { size: "sm", label: "génération en cours…" },
        children: [],
      };
      chatChildren.push("chatSpinner");
    }

    // Messages — each a horizontal Stack [Avatar, Card]
    const msgRowKeys: string[] = [];
    (currentChat?.messages ?? []).forEach((m, mi) => {
      const avatarKey = `msgAv-${mi}`;
      const cardKey = `msgCard-${mi}`;
      const rowKey = `msgRow-${mi}`;
      const isUser = m.role === "user";
      elements[avatarKey] = {
        type: "Avatar",
        props: { src: null, name: isUser ? "Toi" : "Advisor", size: "sm" },
        children: [],
      };
      elements[cardKey] = {
        type: "Card",
        props: {
          maxWidth: "sm",
          title: isUser ? "Toi" : "Advisor",
          description: m.content,
          centered: !isUser,
          className: null,
        },
        children: [],
      };
      // Assistant on right → reverse order by swapping children ordering
      elements[rowKey] = {
        type: "Stack",
        props: {
          direction: "horizontal",
          gap: "sm",
          align: "start",
          justify: isUser ? "start" : "end",
        },
        children: isUser ? [avatarKey, cardKey] : [cardKey, avatarKey],
      };
      msgRowKeys.push(rowKey);
    });

    if (msgRowKeys.length > 0) {
      elements["msgList"] = {
        type: "Stack",
        props: { direction: "vertical", gap: "sm" },
        children: msgRowKeys,
      };
      chatChildren.push("msgList");
    }

    // Chat input (DOIT rester lié à /chatInput)
    elements["chatInput"] = {
      type: "Textarea",
      props: {
        label: "message",
        name: "chatInput",
        placeholder: "pose une question sur cette area…",
        rows: 3,
        value: { $bindState: "/chatInput" },
      },
      children: [],
    };

    // Send button
    elements["chatSend"] = {
      type: "Button",
      props: {
        label: currentChat?.status === "thinking" ? "en attente…" : "envoyer",
        variant: "primary",
        disabled: currentChat?.status === "thinking" || currentChat?.status === "done",
      },
      on: { press: { action: "sendChat", params: { label: currentArea.label } } },
      children: [],
    };

    // Close-session opens a Dialog (builtin setState on /chatCloseDialogOpen = true)
    elements["chatCloseTrigger"] = {
      type: "Button",
      props: {
        label: "terminer la session",
        variant: "secondary",
        disabled: currentChat?.status === "done" || !currentChat,
      },
      on: {
        press: {
          action: "setState",
          params: { statePath: "/chatCloseDialogOpen", value: true },
        },
      },
      children: [],
    };

    // Tooltip affordance on close-session
    elements["chatCloseTooltip"] = {
      type: "Tooltip",
      props: {
        text: "aide",
        content:
          "Fermer la session chat est irréversible : une confirmation te sera demandée avant l'envoi du POST /chat/:area/done.",
      },
      children: [],
    };

    elements["chatActions"] = {
      type: "Stack",
      props: { direction: "horizontal", gap: "sm", align: "center" },
      children: ["chatSend", "chatCloseTrigger", "chatCloseTooltip"],
    };
    chatChildren.push("chatInput", "chatActions");

    // Dialog : confirmation modal for closing the chat
    elements["dlgText"] = {
      type: "Text",
      props: {
        variant: "body",
        text:
          "Cette action marque la session comme terminée côté serveur. Les messages restent consultables mais tu ne pourras plus envoyer de nouveau tour.",
      },
      children: [],
    };
    elements["dlgCancel"] = {
      type: "Button",
      props: { label: "annuler", variant: "secondary", disabled: false },
      on: {
        press: {
          action: "setState",
          params: { statePath: "/chatCloseDialogOpen", value: false },
        },
      },
      children: [],
    };
    elements["dlgConfirm"] = {
      type: "Button",
      props: { label: "confirmer la fermeture", variant: "danger", disabled: false },
      on: { press: { action: "closeChat", params: { label: currentArea.label } } },
      children: [],
    };
    elements["dlgActions"] = {
      type: "Stack",
      props: { direction: "horizontal", gap: "sm", align: "center", justify: "end" },
      children: ["dlgCancel", "dlgConfirm"],
    };
    elements["chatCloseDialog"] = {
      type: "Dialog",
      props: {
        title: "Terminer cette session ?",
        description: "Confirme que tu veux clore le chat pour cette zone grise.",
        openPath: "/chatCloseDialogOpen",
      },
      children: ["dlgText", "dlgActions"],
    };
    chatChildren.push("chatCloseDialog");
  } else if (p.state !== null) {
    elements["chatEmpty"] = {
      type: "Text",
      props: { variant: "muted", text: "sélectionne une area à gauche pour ouvrir un chat" },
      children: [],
    };
    chatChildren.push("chatEmpty");
  } else {
    // Boot state — skeleton chat
    elements["chatSkel1"] = {
      type: "Skeleton",
      props: { width: "70%", height: "1.5rem", rounded: false },
      children: [],
    };
    elements["chatSkel2"] = {
      type: "Skeleton",
      props: { width: "100%", height: "3rem", rounded: false },
      children: [],
    };
    elements["chatSkel3"] = {
      type: "Skeleton",
      props: { width: "100%", height: "5rem", rounded: false },
      children: [],
    };
    elements["chatSkelStack"] = {
      type: "Stack",
      props: { direction: "vertical", gap: "sm" },
      children: ["chatSkel1", "chatSkel2", "chatSkel3"],
    };
    chatChildren.push("chatSkelStack");
  }

  elements["chatSidebar"] = {
    type: "Card",
    props: { maxWidth: "md", title: "chat · area context" },
    children: chatChildren,
  };

  elements["cols"] = {
    type: "Stack",
    props: { direction: "horizontal", gap: "lg", align: "start" },
    children: ["sidebar", "main", "chatSidebar"],
  };

  topChildren.push("cols");
  elements["root"] = {
    type: "Stack",
    props: { direction: "vertical", gap: "md" },
    children: topChildren,
  };

  return { root: "root", elements };
}

export function App() {
  const [state, setState] = useState<DiscussionRecord | null>(null);
  const [score, setScore] = useState<ScoreResponse>(null);
  const [queue, setQueue] = useState<AdvisorRequest[]>([]);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [options, setOptions] = useState<JsonRenderOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"areas" | "options">("areas");
  const [online, setOnline] = useState(false);

  useEffect(() => {
    let lastState = "";
    const tick = async () => {
      try {
        const [sr, cr, qr, chr, or] = await Promise.all([
          fetch("/state", { cache: "no-store" }).then((r) => r.json()),
          fetch("/score", { cache: "no-store" }).then((r) => r.json()),
          fetch("/advisor-queue", { cache: "no-store" }).then((r) => r.json()),
          fetch("/chats", { cache: "no-store" }).then((r) => r.json()),
          fetch("/options", { cache: "no-store" }).then((r) => r.json()),
        ]);
        const h = JSON.stringify(sr);
        if (h !== lastState) {
          lastState = h;
          setState(sr);
        }
        setScore(cr);
        setQueue(Array.isArray(qr) ? qr : []);
        setChats(Array.isArray(chr) ? chr : []);
        setOptions(Array.isArray(or) ? or : []);
        setOnline(true);
      } catch {
        setOnline(false);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const { registry } = useMemo(
    () =>
      defineRegistry(catalog, {
        components: {
          Card: shadcnComponents.Card,
          Stack: shadcnComponents.Stack,
          Grid: shadcnComponents.Grid,
          Separator: shadcnComponents.Separator,
          Tabs: shadcnComponents.Tabs,
          Accordion: shadcnComponents.Accordion,
          Collapsible: shadcnComponents.Collapsible,
          Pagination: shadcnComponents.Pagination,
          Dialog: shadcnComponents.Dialog,
          Drawer: shadcnComponents.Drawer,
          Tooltip: shadcnComponents.Tooltip,
          Popover: shadcnComponents.Popover,
          DropdownMenu: shadcnComponents.DropdownMenu,
          Heading: shadcnComponents.Heading,
          Text: shadcnComponents.Text,
          Image: shadcnComponents.Image,
          Avatar: shadcnComponents.Avatar,
          Badge: shadcnComponents.Badge,
          Alert: shadcnComponents.Alert,
          Carousel: shadcnComponents.Carousel,
          Table: shadcnComponents.Table,
          Progress: shadcnComponents.Progress,
          Skeleton: shadcnComponents.Skeleton,
          Spinner: shadcnComponents.Spinner,
          Button: shadcnComponents.Button,
          Link: shadcnComponents.Link,
          Input: shadcnComponents.Input,
          Textarea: shadcnComponents.Textarea,
          Select: shadcnComponents.Select,
          Checkbox: shadcnComponents.Checkbox,
          Radio: shadcnComponents.Radio,
          Switch: shadcnComponents.Switch,
          Slider: shadcnComponents.Slider,
          Toggle: shadcnComponents.Toggle,
          ToggleGroup: shadcnComponents.ToggleGroup,
          ButtonGroup: shadcnComponents.ButtonGroup,
        },
        actions: {
          selectArea: async (params: any) => {
            if (params?.label) setSelected(params.label);
          },
          triggerAdvisor: async (params: any) => {
            if (!params?.label) return;
            await fetch("/advisor-request", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ area: params.label }),
            });
          },
          sendChat: async (params: any, setJsonState: any, jsonState: any) => {
            const label: string | undefined = params?.label;
            const content: string | undefined = jsonState?.chatInput;
            if (!label || !content || !content.trim()) return;
            await fetch(`/chat/${encodeURIComponent(label)}/message`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ content: content.trim() }),
            });
            if (setJsonState) setJsonState("/chatInput", "");
          },
          switchView: async (params: any) => {
            if (params?.view === "areas" || params?.view === "options") {
              setView(params.view);
            }
          },
          voteOption: async (params: any) => {
            if (!params?.id || !params?.vote) return;
            await fetch("/options/vote", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: params.id, vote: params.vote }),
            });
          },
          closeChat: async (params: any, setJsonState: any) => {
            if (!params?.label) return;
            await fetch(`/chat/${encodeURIComponent(params.label)}/done`, { method: "POST" });
            if (setJsonState) setJsonState("/chatCloseDialogOpen", false);
          },
        },
      }),
    [],
  );

  const spec = useMemo(
    () => buildSpec({ state, score, queue, chats, options, selected, view, online }),
    [state, score, queue, chats, options, selected, view, online],
  );

  const specRef = useRef<any>(spec);
  specRef.current = spec;
  const storeRef = useRef<any>(null);

  useEffect(() => {
    const events = createEventStore({ bufferSize: 500 });
    const selection = createSelectionBus();
    const panel = createPanel({
      context: {
        events,
        getSpec: () => specRef.current,
        getCatalog: () => catalog,
        getStateStore: () => storeRef.current,
        selection,
        activateTab: () => {},
      },
      tabs: [
        specTab(),
        stateTab(),
        catalogTab(),
        streamTab(),
        actionsTab(),
        pickerTab(),
      ],
      position: "bottom-right",
      initialOpen: false,
      shortcut: "mod+shift+j",
    });
    return () => panel.destroy();
  }, []);

  return (
    <JSONUIProvider
      registry={registry}
      initialState={{ chatInput: "", chatCloseDialogOpen: false }}
    >
      <DevtoolsStoreBridge storeRef={storeRef} />
      <Renderer spec={spec as any} registry={registry} />
    </JSONUIProvider>
  );
}

function DevtoolsStoreBridge({ storeRef }: { storeRef: { current: any } }) {
  const store = useStateStore();
  useEffect(() => {
    storeRef.current = store;
  }, [store, storeRef]);
  return null;
}
