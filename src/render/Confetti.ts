import confetti from 'canvas-confetti';

export class ConfettiManager {
  public static shoot() {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.65 },
      colors: ['#00e5ff', '#ff007f', '#ffd700', '#00ff66', '#ffffff'],
    });
  }

  public static grandFinale() {
    const end = Date.now() + 1500;
    const colors = ['#00e5ff', '#ff007f', '#ffd700', '#00ff66', '#ff9100'];

    (function frame() {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors,
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  }
}
