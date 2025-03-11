for (const element of document.querySelectorAll('.tsd-tag')) {
  if (element instanceof HTMLElement && element.textContent) {
    element.setAttribute("data-tag-text", element.textContent);
  }
}
