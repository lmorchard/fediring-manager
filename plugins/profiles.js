import { BasePlugin } from "mastotron";

import fs from "fs/promises";
import { createReadStream } from "fs";
import { parse as csvParser } from "csv-parse";

export default class ProfilesPlugin extends BasePlugin {  
  /** @param {import("../bot.js").default} parent */
  constructor(parent) {
    super(parent);
    this.parent = parent;
  }

  async fetchProfiles() {
    const { git } = this.parent;
    const { profilesFn } = git.gitConfig();
    await git.gitUpdateClone();
    const readStream = createReadStream(profilesFn);
    return this.parseCSV(readStream);
  }

  /**
   * @param {string[][]} profiles 
   */
  async writeProfiles(profiles) {
    const { git } = this.parent;
    const { profilesFn } = git.gitConfig();
    const out = profiles.map((row) => row.join(",")).join("\n");
    await fs.writeFile(profilesFn, out);
    return git.gitPush();
  }

  /**
   * Parse rows of columns from CSV data read from a stream
   * 
   * @param {ReadableStream} readStream 
   * @returns {Promise<string[][]>}
   */
  parseCSV(readStream) {
    return new Promise((resolve, reject) => {
      const parser = csvParser({}, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
      readStream.pipe(parser);
    });
  }

  async addMembers({ members }) {
    const profiles = await this.fetchProfiles();
    // TODO: dedupe members after add?
    await this.writeProfiles([
      ...profiles,
      // TODO: support CSV with multiple columns 😞
      ...members.map((member) => [member]),
    ]);
  }

  async removeMembers({ members }) {
    const profiles = await this.fetchProfiles();
    await this.writeProfiles(
      profiles.filter((row) => !members.includes(row[0]))
    );
  }

  async selectRandomMembers({ count = 5 } = {}) {
    const { dataName } = this.constructor;
    const { data } = this.parent;
    let { selectionHistory = [] } = await data.loadJSON(dataName);
    const profiles = await this.fetchProfiles();

    // Drop some profiles off the end of selection history if necessary
    const profilesCount = profiles.length - 1;
    if (selectionHistory.length + count >= profilesCount) {
      selectionHistory = selectionHistory.slice(0, profilesCount - count);
    }

    const selection = profiles
      // Skip the CSV header
      .slice(1)
      // Take first column
      .map(([address]) => ({ address }))
      // Skip addresses recently selected
      .filter((profile) => !selectionHistory.includes(profile.address))
      // Shuffle what's left.
      .sort(() => Math.random() - 0.5)
      // Take the count we want
      .slice(0, count);

    // Update history including new selection, trimming off older items
    await data.updateJSON(dataName, {
      selectionHistory: [
        ...selection.map((profile) => profile.address),
        ...selectionHistory,
      ],
    });

    return selection;
  }
}
