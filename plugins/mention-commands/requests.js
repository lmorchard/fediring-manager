import { BasePlugin } from "mastotron";

import { Model, ModelArray } from "../../lib/models.js";

export class DeferredRequest extends Model {
  constructor({ request, from } = {}) {
    super({ request, from });
  }
  key() {
    return this.request;
  }
  toJSON() {
    const { request, from } = this;
    return { request, from };
  }
}

export class DeferredRequestArray extends ModelArray {
  static ChildClass = DeferredRequest;
}

export default class RequestMentionCommandsPlugin extends BasePlugin {
  static mentionCommands = [
    {
      token: "pending",
      method: "commandPendingRequests",
      description: "List pending requests",
      usage: "pending",
      admin: true,
    },
    {
      token: "defer",
      method: "commandDeferRequest",
      description: "Add request to the pending list",
      usage: "defer add me",
      admin: true,
    },
    {
      token: "cancel",
      method: "commandCancelRequest",
      description: "Remove request to the pending list",
      usage: "cancel add me",
      admin: true,
    },
    {
      token: "flush",
      method: "commandPendingFlush",
      description: "Clear out the list of pending requests",
      usage: "flush",
      admin: true,
    },
  ];
  
  /** @param {import("../../bot.js").default} parent */
  constructor(parent) {
    super(parent);
  }

  async commandPendingRequests({ account, status }) {
    const { mentionCommands, templates } = this.parent;
    await mentionCommands.requireAdminAccount({ account });

    const { id, visibility } = status;

    const requests = await this.loadPendingRequests();

    await templates.postTemplatedStatus({
      name: "command-pending",
      variables: { requests, account },
      options: { visibility, in_reply_to_id: id },
    });
  }

  async commandDeferRequest({ account, status, params }) {
    const { mentionCommands, templates } = this.parent;
    await mentionCommands.requireAdminAccount({ account });

    const { id, visibility } = status;

    const request = await this.addPendingRequest({
      request: params.join(" "),
      from: account.acct,
    });

    await templates.postTemplatedStatus({
      name: "command-defer",
      variables: { request, account },
      options: { visibility, in_reply_to_id: id },
    });
  }

  async commandCancelRequest({ account, status, params }) {
    const { mentionCommands, templates } = this.parent;
    await mentionCommands.requireAdminAccount({ account });

    const { id, visibility } = status;

    const request = await this.cancelPendingRequest({
      request: params.join(" "),
    });

    await templates.postTemplatedStatus({
      name: "command-cancel",
      variables: { request, account },
      options: { visibility, in_reply_to_id: id },
    });
  }

  async commandPendingFlush({ account, status }) {
    const { mentionCommands, templates } = this.parent;
    await mentionCommands.requireAdminAccount({ account });

    const { id, visibility } = status;

    await this.updatePendingRequests();

    await templates.postTemplatedStatus({
      name: "command-flush",
      variables: { account },
      options: { visibility, in_reply_to_id: id },
    });
  }

  async addPendingRequest(data) {
    const request = new DeferredRequest(data);
    const requests = await this.loadPendingRequests();
    requests.add(request);
    await this.updatePendingRequests(requests);
    return request;
  }

  async cancelPendingRequest(data) {
    const requests = await this.loadPendingRequests();
    const request = requests.findBy(data);
    if (request) {
      requests.remove(request);
      await this.updatePendingRequests(requests);
    }
    return request;
  }

  async loadPendingRequests() {
    const { pendingRequests = [] } = await this.parent.data.loadJSON(
      this.parent.constructor.dataName
    );
    return new DeferredRequestArray(...pendingRequests);
  }

  async updatePendingRequests(requests = []) {
    return this.parent.data.updateJSON(this.parent.constructor.dataName, {
      pendingRequests: requests,
    });
  }
}
