/**
 * @param {ReturnType<import("./requests.js").default>} Base
 */
export default function MembersCommandsMixin(Base) {
  return class MembersCommandsBase extends Base {
    mentionCommands() {
      return [
        ...super.mentionCommands(),
        {
          token: "add",
          method: "commandAdd",
          description: "Add a new member (e.g. add me)",
          usage: "add me",
        },
        {
          token: "remove",
          method: "commandRemove",
          description: "Remote an existing member (e.g. remove me)",
          usage: "remove me",
        },
        {
          token: "random",
          method: "commandRandom",
          description: "Mention one random member",
          usage: "random",
        },
        {
          token: "mention",
          method: "commandMention",
          description: "Mention a random selection of members",
          usage: "mention",
          admin: true,
        },
      ];
    }

    async onInterval() {
      super.onInterval();

      const { dataName } = this.constructor;
      const { config } = this;
      const log = this.logBot();
      log.trace({ msg: "interval" });

      await this.scheduleCallback(
        "lastMemberMention",
        dataName,
        config.get("memberMentionInterval"),
        () => this.mentionMembers()
      );
    }

    async commandAdd({ params, account, status }) {
      const { id, visibility } = status;
      const members = await this.acceptMembersFromParams({ params, account });
      const isAdmin = await this.isAdminAccount({ account });

      const request = ["add", ...members].join(" ");
      const templateOptions = {
        variables: { members: members.join(" "), account },
        options: { visibility, in_reply_to_id: id },
      };

      if (!isAdmin) {
        await this.addPendingRequest({ request, from: account.acct });
        return this.postTemplatedStatus({
          name: "command-add-deferred",
          ...templateOptions,
        });
      }

      await this.addMembers({ members });
      await this.cancelPendingRequest({ request, from: account.acct });

      return this.postTemplatedStatus({
        name: "command-add",
        ...templateOptions,
      });
    }

    async commandRemove({ params, account, status }) {
      const { id, visibility } = status;
      const members = await this.acceptMembersFromParams({ params, account });
      const isAdmin = await this.isAdminAccount({ account });

      const request = ["remove", ...members].join(" ");
      const templateOptions = {
        variables: { members: members.join(" "), account },
        options: { visibility, in_reply_to_id: id },
      };

      if (!isAdmin) {
        await this.addPendingRequest({ request, from: account.acct });
        return this.postTemplatedStatus({
          name: "command-remove-deferred",
          ...templateOptions,
        });
      }

      await this.removeMembers({ members });
      await this.cancelPendingRequest({ request, from: account.acct });

      return this.postTemplatedStatus({
        name: "command-remove",
        ...templateOptions,
      });
    }

    async commandRandom({ account, status }) {
      const { id, visibility } = status;
      const [member] = await this.selectRandomMembers({ count: 1 });
      await this.postTemplatedStatus({
        name: "command-random",
        variables: { member, account },
        options: { visibility, in_reply_to_id: id },
      });
    }

    async commandMention({ account }) {
      await this.requireAdminAccount({ account });
      await this.mentionMembers();
    }

    async mentionMembers() {
      const { config } = this;
      const members = await this.selectRandomMembers({
        count: config.get("memberMentionCount"),
      });
      await this.postTemplatedStatus({
        name: "mention-members",
        variables: { members },
      });
    }
  };
}
