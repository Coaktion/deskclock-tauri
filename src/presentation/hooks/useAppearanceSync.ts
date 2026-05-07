import { useEffect } from "react";
import type { ConfigContextValue } from "@shared/types/appConfig";
import { applyFontSize } from "@shared/utils/fontSize";
import { applyTheme } from "@shared/utils/theme";
import type { Theme } from "@shared/utils/theme";

export function useAppearanceSync(config: ConfigContextValue) {
  useEffect(() => {
    if (!config.isLoaded) return;
    applyFontSize(config.get("fontSize"));
    applyTheme(config.get("theme") as Theme);
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
}
