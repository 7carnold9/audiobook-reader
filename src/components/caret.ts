/**
 * Works out which word a reader clicked on.
 *
 * The transcript renders plain text rather than a span per word, so the word is
 * recovered from the caret position the browser reports for the click point.
 * Only the chunk being spoken is rendered as spans, and those carry the token
 * index directly.
 */
/** Character offset of the click within `container`'s text, or null if unknown. */
export function charOffsetAtPoint(
  container: HTMLElement,
  clientX: number,
  clientY: number,
): number | null {
  // Two spellings of the same thing: the standard one, and WebKit/Blink's.
  // Both are called optionally so an older browser simply falls back.
  const position = document.caretPositionFromPoint?.(clientX, clientY)
  if (position && container.contains(position.offsetNode)) {
    return charOffsetOf(container, position.offsetNode, position.offset)
  }

  const range = document.caretRangeFromPoint?.(clientX, clientY)
  if (range && container.contains(range.startContainer)) {
    return charOffsetOf(container, range.startContainer, range.startOffset)
  }

  return null
}

/** Offset of (node, offset) measured from the start of the container's text. */
function charOffsetOf(container: HTMLElement, node: Node, offset: number): number {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let total = 0
  let current = walker.nextNode()
  while (current) {
    if (current === node) return total + offset
    total += current.textContent?.length ?? 0
    current = walker.nextNode()
  }
  return total
}

/** True when the reader is selecting text rather than picking a starting point. */
export function hasTextSelection(): boolean {
  const selection = window.getSelection()
  return selection !== null && !selection.isCollapsed && selection.toString().trim().length > 0
}
