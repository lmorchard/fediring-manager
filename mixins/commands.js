import fs from "fs/promises";
import { createReadStream } from "fs";

export default (Base) =>
  class extends Base {
    static commandTokens = {
      add: "handleCommandAdd",
      remove: "handleCommandRemove",
      mention: "handleCommandMention",
    };

    configSchema() {
      return {
        ...super.configSchema(),
        adminAccounts: {
          doc: "list of accounts permitted to use administrative commands",
          format: Array,
          nullable: true,
          default: null,
        },
      }
    }

    async requireAdminAccount({ account }) {
      const { config } = this;
      const { acct } = account;
      const log = this.logBot();

      log.debug({ msg: "requireAdminAccount", account });

      const adminAccounts = config.get("adminAccounts");
      if (!adminAccounts.includes(acct)) {
        throw new PermissionDeniedError(`${acct} is not an admin account`);
      }
    }

    async handleCommandMention({ account }) {
      await this.requireAdminAccount({ account });
      await this.mentionMembers();
    }

    async handleCommandAdd({ params, account }) {
      const { profilesFn } = this.gitConfig();
      const log = this.logBot();

      let members;
      if (params[0] == "me") {
        members = [account.acct];
      } else {
        await this.requireAdminAccount({ account });
        members = params;
      }

      await this.gitUpdateClone();

      const readStream = createReadStream(profilesFn);
      const profiles = await this.parseCSV(readStream);
      const out = [...profiles, ...members.map((member) => [member])]
        .map((row) => row.join(","))
        .join("\n");

      await fs.writeFile(profilesFn, out);

      await this.gitPush();
    }

    async handleCommandRemove({ params, account }) {
      const { profilesFn } = this.gitConfig();
      const log = this.logBot();

      let members;
      if (params[0] == "me") {
        members = [account.acct];
      } else {
        await this.requireAdminAccount({ account });
        members = params;
      }

      await this.gitUpdateClone();

      const readStream = createReadStream(profilesFn);
      const profiles = await this.parseCSV(readStream);
      const out = profiles
        .filter((row) => !members.includes(row[0]))
        .map((row) => row.join(","))
        .join("\n");

      await fs.writeFile(profilesFn, out);

      await this.gitPush();
    }

    async mentionMembers() {
      const { config } = this;
      const log = this.logBot();

      const selectedMembers = await this.selectRandomMembers({
        count: config.get("memberMentionCount"),
      });
      const status = MEMBER_MENTION_TEMPLATE({ selectedMembers });

      log.debug({ status });
      console.log(status);

      /*
    const resp = this.postStatus({ status, visibility: "public" });
    log.trace({ msg: "mentionMembersPosted", resp });
    */
    }

    async selectRandomMembers({ count = 5, maxHistoryRatio = 0.5 } = {}) {
      const { dataName } = this.constructor;
      const { profilesFn } = this.gitConfig();

      await this.gitUpdateClone();
      const readStream = createReadStream(profilesFn);
      const profiles = await this.parseCSV(readStream);
      profiles.shift();

      const { selectionHistory = [] } = await this.loadJSON(dataName);

      const selection = profiles
        .map((row) => row[0])
        .filter((addr) => !selectionHistory.includes(addr))
        .sort(() => Math.random() - 0.5)
        .slice(0, count);

      const maxHistory = Math.floor(profiles.length * maxHistoryRatio);
      await this.updateJSON(dataName, {
        selectionHistory: [...selection, ...selectionHistory].slice(
          0,
          maxHistory
        ),
      });

      return selection;
    }
  };
