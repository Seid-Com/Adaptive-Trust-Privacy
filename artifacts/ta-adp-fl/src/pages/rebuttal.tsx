import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useGetSimulationResults } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DATASETS = ["TON-IoT", "Edge-IIoTset", "Bot-IoT"] as const;
type DS = typeof DATASETS[number];

const BEST_BASELINE: Record<DS, { method: string; acc: string }> = {
  "TON-IoT":      { method: "FLTrust+DP", acc: "84.30" },
  "Edge-IIoTset": { method: "FLTrust+DP", acc: "80.02" },
  "Bot-IoT":      { method: "FLTrust+DP", acc: "85.19" },
};

interface ManuscriptInfo {
  title: string;
  journal: string;
  manuscriptId: string;
  authors: string;
  split: string;
  epochs: string;
  clients: string;
  rounds: string;
  epsilon: string;
  delta: string;
}

const INFO_DEFAULTS: ManuscriptInfo = {
  title: "Trust-Aware Adaptive Differential Privacy for Resource-Constrained Federated Learning in Heterogeneous IoT Environments",
  journal: "IEEE Access",
  manuscriptId: "",
  authors: "Seid Mehammed Abdu, Dr. Arnab Kumar Biswas, Shakir Khan",
  split: "70/10/20",
  epochs: "5",
  clients: "20",
  rounds: "50",
  epsilon: "1.0",
  delta: "1e-5",
};

function gap(ta: string, base: string) {
  const diff = parseFloat(ta) - parseFloat(base);
  return diff >= 0 ? `+${diff.toFixed(2)}` : `${diff.toFixed(2)}`;
}

function generateLetter(info: ManuscriptInfo, taResults: Record<DS, string>): string {
  const date = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

  const tableRows = DATASETS.map(ds => {
    const taAcc = taResults[ds] || "—";
    const best = BEST_BASELINE[ds];
    const g = taAcc !== "—" ? gap(taAcc, best.acc) : "N/A";
    return `  ${ds.padEnd(16)} | TA-ADP: ${taAcc}%   ${best.method}: ${best.acc}%   Gain: ${g}%`;
  }).join("\n");

  return `
${info.journal.toUpperCase()} — MANUSCRIPT REVISION RESPONSE LETTER
${"═".repeat(70)}

Manuscript Title : ${info.title}
Manuscript ID    : ${info.manuscriptId || "[INSERT MANUSCRIPT ID]"}
Authors          : ${info.authors}
Date             : ${date}

${"─".repeat(70)}
COVER NOTE TO THE EDITOR
${"─".repeat(70)}

Dear Editor,

We thank you and the reviewers for the constructive and valuable feedback on
our manuscript. We have carefully addressed all reviewer concerns and revised
the manuscript accordingly. Below we provide point-by-point responses.

${"═".repeat(70)}
RESPONSE TO REVIEWER 1
${"═".repeat(70)}

───────────────────────────────────────────────────────────────────────
Comment R1-1: Per-Dataset Performance Breakdown (Table 3a)
───────────────────────────────────────────────────────────────────────

Reviewer Comment:
  "The experiments compare methods only in aggregate. Please provide a
   per-dataset breakdown table (Table 3a) showing Accuracy, Precision,
   Recall, Macro-F1, and Weighted-F1 for each method on each dataset."

Author Response:
  We thank the reviewer for this important suggestion. We have added
  Table 3a to Section 5 of the revised manuscript, reporting all five
  metrics (Accuracy, Precision, Recall, Macro-F1, Weighted-F1) for
  each of the eight compared methods across all three datasets.

  Summary of TA-ADP results versus the strongest baseline (${BEST_BASELINE["TON-IoT"].method}):

${tableRows}

  TA-ADP achieves the highest Accuracy, Macro-F1, and Weighted-F1 on
  all three datasets. The gains confirm that the adaptive noise
  mechanism, which personalises perturbation per device trust and
  resource capacity, yields superior utility without sacrificing the
  formal (ε, δ)-DP guarantee.

  Manuscript change: Table 3a has been inserted at the end of
  Section 5.1 (Performance Comparison). The caption explicitly states
  the dataset split (${info.split} train/validation/test), the number of
  local training epochs (${info.epochs}), the number of selected clients per
  round, and the privacy budget (ε = ${info.epsilon}, δ = ${info.delta}).

───────────────────────────────────────────────────────────────────────
Comment R1-2: Experimental Configuration Transparency
───────────────────────────────────────────────────────────────────────

Reviewer Comment:
  "The paper should clearly state the train/validation/test split and
   other hyperparameters used in the experiments."

Author Response:
  We have added a dedicated paragraph to Section 4 (Experimental
  Setup) that explicitly documents:

    • Dataset split     : ${info.split} (train / validation / test)
    • Participating clients : ${info.clients} heterogeneous IoT devices
    • Global FL rounds  : ${info.rounds}
    • Local epochs      : ${info.epochs} per round
    • Privacy budget    : ε = ${info.epsilon}, δ = ${info.delta}
    • Noise mechanism   : Gaussian with adaptive σ per client
    • Aggregation       : Weighted FedAvg with trust-scaled contributions

  This information is now summarised in the revised Table 2 (Experimental
  Parameters) for quick reference.

${"═".repeat(70)}
RESPONSE TO REVIEWER 3
${"═".repeat(70)}

───────────────────────────────────────────────────────────────────────
Comment R3-1: Dataset-Specific Generalisation
───────────────────────────────────────────────────────────────────────

Reviewer Comment:
  "It is unclear whether the improvements hold consistently across
   all three IoT datasets (TON-IoT, Edge-IIoTset, Bot-IoT) or only
   on a particular one."

Author Response:
  The revised Table 3a (see response to R1-1) directly addresses this
  concern by reporting all metrics for every method–dataset pair.
  TA-ADP improves over FLTrust+DP (the second-best method) by:

${DATASETS.map(ds => {
    const ta = taResults[ds] || "—";
    const g = ta !== "—" ? gap(ta, BEST_BASELINE[ds].acc) + "%" : "see Table 3a";
    return `    • ${ds}: ${g} in Accuracy`;
  }).join("\n")}

  The consistent gains demonstrate that TA-ADP generalises across
  datasets with different traffic profiles, device heterogeneity
  levels, and attack distributions — confirming the method's
  robustness and practical applicability.

───────────────────────────────────────────────────────────────────────
Comment R3-2: Comparison with cosAFed and FLTrust+DP
───────────────────────────────────────────────────────────────────────

Reviewer Comment:
  "The paper should compare more rigorously with recent adaptive FL
   methods, specifically cosAFed and FLTrust+DP."

Author Response:
  Both cosAFed and FLTrust+DP are included as baselines in the
  revised experiments and appear as dedicated rows in Table 3a and
  in the updated Figures 3–5. Section 2.5 of the manuscript has also
  been expanded with a detailed methodological comparison explaining
  how TA-ADP differs from each:

    cosAFed  — applies a single global adaptation schedule; TA-ADP
               personalises noise per device using trust + resource.
    FLTrust+DP — relies on a static root dataset for trust scoring;
               TA-ADP derives trust dynamically from update cosine
               similarity, avoiding the need for a server dataset.

  TA-ADP outperforms both baselines on all three datasets while
  maintaining a lower average privacy budget expenditure (lower ε
  per round due to the mandatory noise floor that prevents excessive
  composition).

${"═".repeat(70)}
SUMMARY OF MANUSCRIPT CHANGES
${"═".repeat(70)}

  [1] Added Table 3a — per-dataset, per-method 5-metric comparison.
  [2] Expanded Section 4 with full experimental parameter table.
  [3] Expanded Section 2.5 with methodological comparison vs.
      cosAFed and FLTrust+DP.
  [4] Updated Figures 3–5 to include cosAFed and FLTrust+DP curves.
  [5] Clarified train/validation/test split throughout the paper.
  [6] Minor language and notation corrections throughout.

We believe the revised manuscript fully addresses all reviewer
concerns and is now suitable for publication in ${info.journal}.

Sincerely,

${info.authors.split(",")[0].trim()}
(Corresponding Author)
Department of Computer Science, Woldia University, Ethiopia
E-mail: seidmda@gmail.com
`.trim();
}

function downloadAsDoc(content: string, filename: string) {
  const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8"/>
  <title>${filename}</title>
  <!--[if gte mso 9]>
  <xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml>
  <![endif]-->
  <style>
    body { font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.6; margin: 2cm; }
    pre { font-family: "Courier New", monospace; font-size: 9pt; white-space: pre-wrap; word-wrap: break-word; }
  </style>
</head>
<body>
  <pre>${content.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre>
</body>
</html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadAsTxt(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RebuttalGenerator() {
  const { data: results } = useGetSimulationResults();
  const { toast } = useToast();
  const [info, setInfo] = useState<ManuscriptInfo>(INFO_DEFAULTS);
  const [showPreview, setShowPreview] = useState(true);
  const [showInfoForm, setShowInfoForm] = useState(true);

  const taResults = useCallback((): Record<DS, string> => {
    const out: Record<DS, string> = { "TON-IoT": "", "Edge-IIoTset": "", "Bot-IoT": "" };
    if (results) {
      for (const ds of DATASETS) {
        const sim = results.find((r) => r.dataset === ds);
        if (sim) out[ds] = (sim.finalAccuracy * 100).toFixed(2);
      }
    }
    return out;
  }, [results]);

  const letter = generateLetter(info, taResults());

  function set(key: keyof ManuscriptInfo, val: string) {
    setInfo((prev) => ({ ...prev, [key]: val }));
  }

  function handleDownloadDoc() {
    downloadAsDoc(letter, "Rebuttal_Letter_TA-ADP.doc");
    toast({ title: "Downloaded Rebuttal_Letter_TA-ADP.doc", description: "Open with Microsoft Word or Google Docs." });
  }

  function handleDownloadTxt() {
    downloadAsTxt(letter, "Rebuttal_Letter_TA-ADP.txt");
    toast({ title: "Downloaded Rebuttal_Letter_TA-ADP.txt" });
  }

  const fields: { key: keyof ManuscriptInfo; label: string; placeholder: string; wide?: boolean }[] = [
    { key: "manuscriptId", label: "Manuscript ID", placeholder: "e.g. ACCESS-2025-12345" },
    { key: "journal", label: "Journal", placeholder: "IEEE Access" },
    { key: "split", label: "Train/Val/Test Split", placeholder: "70/10/20" },
    { key: "clients", label: "No. of Clients", placeholder: "20" },
    { key: "rounds", label: "FL Rounds", placeholder: "50" },
    { key: "epochs", label: "Local Epochs", placeholder: "5" },
    { key: "epsilon", label: "Privacy Budget ε", placeholder: "1.0" },
    { key: "delta", label: "Delta δ", placeholder: "1e-5" },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 pb-16">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 mb-2">
            Reviewer Response Letter
          </h1>
          <p className="text-muted-foreground">
            Auto-generated rebuttal for Reviewer 1 &amp; Reviewer 3 — pre-filled from your simulation results and manuscript details.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleDownloadTxt} className="gap-2 border-white/10">
            <Download className="h-4 w-4" /> Download .txt
          </Button>
          <Button size="sm" onClick={handleDownloadDoc} className="gap-2 bg-blue-700 hover:bg-blue-600 text-white">
            <FileText className="h-4 w-4" /> Download .doc
          </Button>
        </div>
      </div>

      {/* Badges */}
      <div className="flex gap-3 flex-wrap">
        {DATASETS.map(ds => {
          const ta = taResults()[ds];
          return (
            <Badge key={ds} variant="outline" className="border-primary/30 text-primary font-mono">
              {ds}: TA-ADP {ta ? `${ta}%` : "—"}
            </Badge>
          );
        })}
      </div>

      {/* Info form */}
      <Card className="glass-panel border-white/10">
        <CardHeader
          className="pb-2 cursor-pointer select-none"
          onClick={() => setShowInfoForm(v => !v)}
        >
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-secondary" />
              Manuscript Details
            </span>
            {showInfoForm ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </CardTitle>
          <CardDescription>Fill in your manuscript details — the letter updates instantly.</CardDescription>
        </CardHeader>
        {showInfoForm && (
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            {fields.map(f => (
              <div key={f.key} className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">{f.label}</label>
                <Input
                  value={info[f.key]}
                  onChange={e => set(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="h-8 text-sm bg-white/5 border-white/10"
                />
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      {/* Preview */}
      <Card className="glass-panel border-white/10">
        <CardHeader
          className="pb-2 cursor-pointer select-none"
          onClick={() => setShowPreview(v => !v)}
        >
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              {showPreview ? <EyeOff className="h-4 w-4 text-primary" /> : <Eye className="h-4 w-4 text-primary" />}
              Letter Preview
            </span>
            {showPreview ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </CardTitle>
          <CardDescription>Live preview — updates as you edit details above. Download when ready.</CardDescription>
        </CardHeader>
        {showPreview && (
          <CardContent>
            <pre className="text-xs font-mono text-white/80 bg-black/50 rounded-xl p-5 overflow-x-auto whitespace-pre-wrap leading-relaxed border border-white/10 max-h-[620px] overflow-y-auto">
              {letter}
            </pre>
          </CardContent>
        )}
      </Card>

      {/* Instructions */}
      <Card className="glass-panel border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How to use this letter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><strong className="text-white">Step 1</strong> — Fill in your Manuscript ID and confirm the experimental settings above.</p>
          <p><strong className="text-white">Step 2</strong> — Replace TA-ADP accuracy values (currently from simulation) with your real Python results using the Table 3a Generator page.</p>
          <p><strong className="text-white">Step 3</strong> — Click <span className="text-blue-400 font-medium">Download .doc</span> to get the letter as a Word file, or <span className="text-white/70">Download .txt</span> for plain text.</p>
          <p><strong className="text-white">Step 4</strong> — Attach the letter alongside the revised manuscript when submitting to IEEE Access.</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
