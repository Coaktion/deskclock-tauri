import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useUpdater } from "@presentation/hooks/useUpdater";
import { RefreshCw, Download, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";

const SECTION_LABELS: Record<string, string> = {
  Features: "Novidades",
  "Bug Fixes": "Correções",
  "Performance Improvements": "Melhorias",
  "BREAKING CHANGES": "Mudanças importantes",
};

function ReleaseNotes({ body }: { body: string }) {
  const changelogPart = body.split(/\n---\n/)[0];
  const lines = changelogPart.split("\n");
  const items: { type: "header" | "bullet"; text: string; key: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("## ") || line.startsWith("### Instalação")) continue;
    if (line.startsWith("### ")) {
      const raw = line.slice(4);
      items.push({ type: "header", text: SECTION_LABELS[raw] ?? raw, key: i });
    } else if (line.startsWith("* ") || line.startsWith("- ")) {
      const text = line
        .slice(2)
        .replace(/\s*\(\[[\da-f]+\]\([^)]+\)\)/g, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .trim();
      if (text) items.push({ type: "bullet", text, key: i });
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-gray-500 bg-gray-800 rounded-lg px-3 py-2 whitespace-pre-wrap">
        {body}
      </p>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg px-3 py-2 space-y-0.5 max-h-48 overflow-y-auto">
      {items.map((item) =>
        item.type === "header" ? (
          <p key={item.key} className="text-xs font-medium text-gray-300 pt-1.5 first:pt-0">
            {item.text}
          </p>
        ) : (
          <div key={item.key} className="flex gap-1.5 text-xs text-gray-400">
            <span className="text-gray-600 shrink-0">•</span>
            <span>{item.text}</span>
          </div>
        )
      )}
    </div>
  );
}

function UpdaterSection() {
  const { state, check, downloadAndInstall, relaunch } = useUpdater();
  const [appVersion, setAppVersion] = useState<string>("");

  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Versão atual: {appVersion}</p>
      </div>

      {state.status === "idle" && (
        <button
          onClick={check}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 hover:border-gray-500 transition-colors"
        >
          <RefreshCw size={14} />
          Verificar atualizações
        </button>
      )}

      {state.status === "checking" && (
        <p className="text-sm text-gray-400 flex items-center gap-2">
          <RefreshCw size={14} className="animate-spin" />
          Verificando…
        </p>
      )}

      {state.status === "available" && (
        <div className="space-y-2">
          <p className="text-sm text-violet-300 flex items-center gap-2">
            <Download size={14} />
            DeskClock {state.version} disponível
          </p>
          {state.body && <ReleaseNotes body={state.body} />}
          <button
            onClick={downloadAndInstall}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-sm text-white transition-colors"
          >
            <Download size={14} />
            Baixar e instalar
          </button>
        </div>
      )}

      {state.status === "downloading" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-300">Baixando…</p>
          <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-violet-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${state.progress ?? 0}%` }}
            />
          </div>
          {state.progress != null && (
            <p className="text-xs text-gray-500 tabular-nums">{state.progress}%</p>
          )}
        </div>
      )}

      {state.status === "ready" && (
        <div className="space-y-2">
          <p className="text-sm text-green-300 flex items-center gap-2">
            <CheckCircle2 size={14} />
            Pronto para instalar
          </p>
          <button
            onClick={relaunch}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-sm text-white transition-colors"
          >
            <RotateCcw size={14} />
            Reiniciar agora
          </button>
        </div>
      )}

      {state.status === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-red-400 flex items-center gap-2">
            <AlertCircle size={14} />
            Falha ao verificar
          </p>
          {state.error && (
            <p className="text-xs text-gray-500 bg-gray-800 rounded-lg px-3 py-2 break-all">
              {state.error}
            </p>
          )}
          <button
            onClick={check}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 hover:border-gray-500 transition-colors"
          >
            <RefreshCw size={14} />
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}

export function AtualizacoesTab() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <UpdaterSection />
    </div>
  );
}
