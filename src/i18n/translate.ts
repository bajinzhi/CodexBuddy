import type { TOptions } from "i18next";
import i18n from "./index";

export function translate(key: string, options?: TOptions) {
  return i18n.t(key, options);
}
