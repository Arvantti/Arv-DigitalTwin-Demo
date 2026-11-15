/** Centro de control de la planta de salsas (control-salsas.html): la pantalla vive en plants/sauce-plant-v1/app; aquí, los estilos comunes. */
import "./styles.css";
import "./aps.css";
import "./control.css";
import "./movil.css";
import { mountSauceControl } from "@plants/sauce-plant-v1-app/control.ts";

mountSauceControl(document.getElementById("app")!);
