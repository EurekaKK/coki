import type { CokiAPI } from "@coki/preload/src/index";

declare global {
  interface Window {
    coki: CokiAPI;
  }
}
