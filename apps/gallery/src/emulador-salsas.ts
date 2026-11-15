/** Emulador de la planta de salsas (emulador-salsas.html): la pantalla vive en plants/sauce-plant-v1/app; aquí, los estilos comunes. */
import "./styles.css";
import "./aps.css";
import "./movil.css";
import { mountSauceEmulator } from "@plants/sauce-plant-v1-app/emulador.ts";

mountSauceEmulator(document.getElementById("app")!);
