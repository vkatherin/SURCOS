// =============================================================
//  CONFETI: lluvia suave en el ingreso y explosión al guardar
// =============================================================
(function () {
  const COLORES = ["#D6006F", "#FFB800", "#00939C", "#F2541B", "#23893C", "#A97BE0", "#FFFFFF"];
  const quieto = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const azar = (a, b) => a + Math.random() * (b - a);

  function pieza(w, h, desdeArriba) {
    return {
      x: azar(0, w), y: desdeArriba ? azar(-h, 0) : azar(0, h),
      vx: azar(-0.3, 0.3), vy: azar(0.4, 1.2), r: azar(0, Math.PI * 2), vr: azar(-0.05, 0.05),
      s: azar(4, 9), c: COLORES[(Math.random() * COLORES.length) | 0], forma: Math.random() < 0.5 ? 0 : 1
    };
  }
  function dibujar(ctx, p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
    if (p.forma) ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    else { ctx.beginPath(); ctx.arc(0, 0, p.s / 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function ajustar(cv) {
    const d = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    cv.width = Math.max(1, r.width * d); cv.height = Math.max(1, r.height * d);
    const ctx = cv.getContext("2d"); ctx.setTransform(d, 0, 0, d, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }

  // Lluvia continua (pantalla de ingreso)
  window.lluviaConfeti = function (cv) {
    if (!cv || quieto) return () => {};
    let { ctx, w, h } = ajustar(cv), vivo = true;
    const piezas = Array.from({ length: 70 }, () => pieza(w, h, false));
    const alCambiar = () => ({ ctx, w, h } = ajustar(cv));
    window.addEventListener("resize", alCambiar);
    (function ciclo() {
      if (!vivo) return;
      ctx.clearRect(0, 0, w, h);
      piezas.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        if (p.y > h + 10) Object.assign(p, pieza(w, h, true), { y: -10 });
        dibujar(ctx, p);
      });
      requestAnimationFrame(ciclo);
    })();
    return () => { vivo = false; window.removeEventListener("resize", alCambiar); };
  };

  // Explosión de celebración
  window.celebrar = function (fuerte) {
    const cv = document.getElementById("confeti");
    if (!cv || quieto) return;
    const { ctx, w, h } = ajustar(cv);
    const n = fuerte ? 220 : 90;
    const piezas = Array.from({ length: n }, () => {
      const p = pieza(w, h, false);
      p.x = w / 2 + azar(-60, 60); p.y = h * 0.55;
      const ang = azar(-Math.PI * 0.9, -Math.PI * 0.1), vel = azar(6, fuerte ? 16 : 12);
      p.vx = Math.cos(ang) * vel; p.vy = Math.sin(ang) * vel;
      return p;
    });
    let t = 0;
    (function ciclo() {
      ctx.clearRect(0, 0, w, h);
      piezas.forEach(p => { p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr * 4; dibujar(ctx, p); });
      if (++t < 170) requestAnimationFrame(ciclo); else ctx.clearRect(0, 0, w, h);
    })();
  };
})();
