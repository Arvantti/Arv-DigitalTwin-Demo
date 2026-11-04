/* Shared deterministic motion helpers for ARVANTTI videos. */
window.ArvanttiMotion = {
  words(selector) {
    return gsap.fromTo(selector, {opacity:0, y:50, scale:.78}, {opacity:1, y:0, scale:1, stagger:.1, duration:.35, ease:'back.out(1.8)'});
  },
  draw(selector, duration=.7) {
    return gsap.fromTo(selector, {strokeDashoffset:500}, {strokeDashoffset:0, duration, ease:'power2.out'});
  },
  pulse(selector, options={}) {
    return gsap.to(selector, {scale:options.scale||1.06, repeat:options.repeat||3, yoyo:true, duration:options.duration||.2, ease:'sine.inOut'});
  },
  speaker(tl, selector='#speaker', start=0, end=3) {
    tl.fromTo(selector, {opacity:0, y:25, scale:.8}, {opacity:1, y:0, scale:1, duration:.45, ease:'back.out(1.6)'}, start)
      .to(selector, {y:-7, repeat:4, yoyo:true, duration:.18, ease:'sine.inOut'}, start+.45)
      .to(selector, {opacity:0, duration:.25}, end);
    return tl;
  },
  swapFrames(tl, selector, frames, start, step=.35) {
    frames.forEach((src, index) => tl.set(selector, {attr:{src}}, start + index * step));
    return tl;
  }
};
