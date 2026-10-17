"use strict";

// Gives every button a short visual pulse when it is pressed.
export function createClickFeedbackFeature() {
  document.addEventListener(
    "pointerdown",
    event => {
      const button = event.target.closest("button:not(:disabled)");
      if (!button) return;

      button.classList.remove("press-pulse");
      void button.offsetWidth; // restart the animation on rapid clicks
      button.classList.add("press-pulse");

      button.addEventListener(
        "animationend",
        () => button.classList.remove("press-pulse"),
        { once: true }
      );
    },
    true
  );
}
