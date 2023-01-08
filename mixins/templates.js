import fs from "fs/promises";
import path from "path";
import Handlebars from "handlebars";

export default (Base) =>
  class extends Base {
    constructor(options) {
      super(options);

      this._templates = {};
      this.handlebars = Handlebars.create();

      this.handlebars.registerHelper("randomchoices", function (options) {
        console.log(options);
        this._randomChoices = [];
        options.fn(this);
        const output =
          this._randomChoices[
            Math.floor(Math.random() * this._randomChoices.length)
          ];
        delete this._randomChoices;
        return output;
      });
      
      this.handlebars.registerHelper("choice", function (options) {
        if (!this._randomChoices) return;
        this._randomChoices.push(options.fn(this));
      });
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
        this._templates[name] = this.handlebars.compile(templateSource.toString());
      }
      return this._templates[name];
    }

    async postTemplatedStatus({
      name,
      variables = {},
      options = { visibility: "public" },
    }) {
      const template = await this.getTemplate(name);
      const status = template(variables);
      return this.postStatus({ status, ...options });
    }
  };
