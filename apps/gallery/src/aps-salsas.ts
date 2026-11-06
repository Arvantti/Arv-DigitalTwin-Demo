/** APS de la planta de salsas (aps-salsas.html): la pantalla vive en plants/sauce-plant-v1/app; aquí, los estilos comunes. */
import "./styles.css";
import "./aps.css";
import { mountSauceAps } from "@plants/sauce-plant-v1-app/aps.ts";

mountSauceAps(document.getElementById("app")!);
