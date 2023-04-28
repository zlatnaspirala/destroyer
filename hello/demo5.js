
import { Safir, On } from "../index";
import RocketCraftingLayout from "./layouts/rocket-crafting-account";

let app = new Safir();

On("app.ready", () => {
  let apiDomain = 'http://localhost';
  app.loadComponent(new RocketCraftingLayout(apiDomain), 'bg-transparent');
  document.body.classList.add('funnyBg2')
});
