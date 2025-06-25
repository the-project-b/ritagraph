export function localeToLanguage(locale: string) {
  switch (locale) {
    case "en":
      return "English";
    case "de":
      return "German";
    default:
      return "German";
  }
}
