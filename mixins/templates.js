import fs from "fs/promises";
import path from "path";
import Handlebars from "handlebars";

export default (Base) =>
  class extends Base {
    constructor(options) {
      super(options);

      this._templates = {};
    }

    configSchema() {
      return {
        ...super.configSchema(),
        templatesPath: {
          doc: "path where content templates can be found",
          env: "TEMPLATES_PATH",
          format: String,
          default: "./templates",
        },
      };
    }

    async getTemplate(name) {
      if (!this._templates[name]) {
        const { config } = this;
        const templatePath = path.join(
          config.get("templatesPath"),
          `${name}.hbs`
        );
        const templateSource = await fs.readFile(templatePath);
        this._templates[name] = Handlebars.compile(templateSource.toString());
      }
      return this._templates[name];
    }
  };
