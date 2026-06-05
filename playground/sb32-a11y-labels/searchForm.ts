// Returns the markup for the site search form. Accessibility issues users hit
// with a screen reader / keyboard:
//   - the text input has no associated <label> (placeholder is not a label)
//   - the icon-only submit button has no accessible name
// Fix the markup so every input has a programmatically associated label (id +
// matching <label for>) and the button exposes an accessible name (visible text
// or aria-label). Keep it a search form with the same fields.
export function searchFormHtml(): string {
  return `
    <form role="search">
      <input type="text" placeholder="Search" name="q" />
      <button type="submit"><svg aria-hidden="true"></svg></button>
    </form>
  `;
}
