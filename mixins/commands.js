class PermissionDeniedError extends Error {
  constructor(message) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export default (Base) =>
  class extends Base {
    constructor(options) {
      super(options);
      const { program } = this;

      program.command("play").action(() => {
        this.mentionMembers();
      });
    }

    static commandTokens = {
      add: "commandAdd",
      remove: "commandRemove",
      mention: "commandMention",
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
      };
    }

    async commandMention({ account }) {
      await this.requireAdminAccount({ account });
      await this.mentionMembers();
    }

    async commandAdd({ params, account }) {
      const members = await this.acceptMembersFromParams({ params, account });
      const profiles = await this.fetchProfiles();
      await this.writeProfiles([
        ...profiles,
        ...members.map((member) => [member]),
      ]);
    }

    async commandRemove({ params, account }) {
      const members = await this.acceptMembersFromParams({ params, account });
      const profiles = await this.fetchProfiles();
      await this.writeProfiles(
        profiles.filter((row) => !members.includes(row[0]))
      );
    }

    async mentionMembers() {
      const { config } = this;
      const log = this.logBot();

      const template = await this.getTemplate("mention-members");
      const members = await this.selectRandomMembers({
        count: config.get("memberMentionCount"),
      });
      const status = template({ members });

      const resp = this.postStatus({ status, visibility: "public" });
      log.trace({ msg: "mentionMembersPosted", resp });
    }

    async acceptMembersFromParams({ params, account }) {
      if (params[0] == "me") {
        return [account.acct];
      }
      await this.requireAdminAccount({ account });
      return params;
    }

    async requireAdminAccount({ account }) {
      const { config } = this;
      const { acct } = account;
      const log = this.logBot();

      log.trace({ msg: "requireAdminAccount", account });

      const adminAccounts = config.get("adminAccounts");
      if (!adminAccounts.includes(acct)) {
        throw new PermissionDeniedError(`${acct} is not an admin account`);
      }
    }
  };
