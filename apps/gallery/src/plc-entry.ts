// La HMI solo se ejecuta dentro del escritorio 3D. Las URLs antiguas conservan su contexto.
const params = new URLSearchParams(location.search);
let insideWorkspace = false;
try {
  insideWorkspace = window.parent !== window
    && window.parent.location.origin === location.origin
    && window.parent.document.querySelector<HTMLIFrameElement>("#water-plc-frame")?.contentWindow === window;
} catch { /* Un padre de otro origen no es el escritorio del gemelo. */ }

if (insideWorkspace) {
  params.set("embedded", "1");
  history.replaceState(null, "", `${location.pathname}?${params}${location.hash}`);
  await import("./plc");
  document.documentElement.removeAttribute("data-plc-pending");
} else {
  params.delete("embedded");
  if (!params.has("plant")) params.set("plant", "water-network-scale-v1");
  params.set("workspace", "plc");
  location.replace(`/plant.html?${params}${location.hash}`);
}
export {};
