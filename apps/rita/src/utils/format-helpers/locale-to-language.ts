export function localeToLanguage(locale: string) {
  switch (locale) {
    case "EN":
      return "English";
    case "DE":
      return "German";
    default:
      return "German";
  }
}
