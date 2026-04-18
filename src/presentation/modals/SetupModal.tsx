import { useState } from "react";
import { ChevronRight, ChevronLeft, Clock } from "lucide-react";
import type { ConfigContextValue } from "@presentation/contexts/ConfigContext";
import { ProjectRepository } from "@infra/database/ProjectRepository";
import { CategoryRepository } from "@infra/database/CategoryRepository";
import { bulkImportProjects } from "@domain/usecases/projects/BulkImportProjects";
import { bulkImportCategories } from "@domain/usecases/categories/BulkImportCategories";

const projectRepo = new ProjectRepository();
const categoryRepo = new CategoryRepository();

const STEPS = ["Boas-vindas", "Projetos", "Categorias"] as const;

interface SetupModalProps {
  config: ConfigContextValue;
  onComplete: () => void;
}

export function SetupModal({ config, onComplete }: SetupModalProps) {
  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState("");
  const [projectsText, setProjectsText] = useState("");
  const [categoriesText, setCategoriesText] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleComplete() {
    setSaving(true);
    if (userName.trim()) await config.set("userName", userName.trim());
    if (projectsText.trim()) await bulkImportProjects(projectRepo, projectsText);
    if (categoriesText.trim()) await bulkImportCategories(categoryRepo, categoriesText);
    await config.set("setupCompleted", true);
    onComplete();
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-lg mx-4 flex flex-col gap-8">

        {/* Logo + título */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="p-3 bg-blue-600/20 rounded-2xl">
            <Clock size={32} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-100">Bem-vindo ao DeskClock</h1>
            <p className="text-sm text-gray-400 mt-1">Vamos configurar o básico para você começar</p>
          </div>
        </div>

        {/* Indicador de progresso */}
        <div className="flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className={`flex-1 h-1 rounded-full transition-colors ${
                i <= step ? "bg-blue-500" : "bg-gray-800"
              }`} />
              {i === STEPS.length - 1 && (
                <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                  i < step ? "bg-blue-500" : i === step ? "bg-blue-400" : "bg-gray-700"
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Conteúdo do passo */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
          {step === 0 && (
            <>
              <div>
                <h2 className="text-base font-medium text-gray-100">Como quer ser chamado?</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Usado na mensagem de boas-vindas ao abrir o app.
                </p>
              </div>
              <input
                autoFocus
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") setStep(1); }}
                placeholder="Seu nome (opcional)"
                className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <h2 className="text-base font-medium text-gray-100">Projetos</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Um projeto por linha. Você pode adicionar mais depois em Dados.
                </p>
              </div>
              <textarea
                autoFocus
                value={projectsText}
                onChange={(e) => setProjectsText(e.target.value)}
                placeholder={"Projeto Alpha\nCliente XYZ\nInterno"}
                rows={6}
                className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none font-mono"
              />
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h2 className="text-base font-medium text-gray-100">Categorias</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Uma categoria por linha. Prefixo <code className="text-gray-300 bg-gray-800 px-1 rounded">!</code> = non-billable.
                </p>
              </div>
              <textarea
                autoFocus
                value={categoriesText}
                onChange={(e) => setCategoriesText(e.target.value)}
                placeholder={"Desenvolvimento\nDesign\n!Reunião\n!Administrativo"}
                rows={6}
                className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none font-mono"
              />
            </>
          )}
        </div>

        {/* Navegação */}
        <div className="flex items-center justify-between">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              <ChevronLeft size={16} />
              Voltar
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (isLast) void handleComplete();
                else setStep((s) => s + 1);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              {isLast ? "Pular tudo e começar" : "Pular"}
              {!isLast && <ChevronRight size={14} />}
            </button>
            <button
              onClick={() => {
                if (isLast) void handleComplete();
                else setStep((s) => s + 1);
              }}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
            >
              {isLast ? "Começar" : "Próximo"}
              {!isLast && <ChevronRight size={14} />}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
