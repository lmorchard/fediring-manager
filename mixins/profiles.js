import fs from "fs/promises";
import { createReadStream } from "fs";
import { parse as csvParser } from "csv-parse";

/** 
 * @param {ReturnType<import("./templates.js").default>} Base 
 */
export default (Base) =>
  class ProfilesMixin extends Base {
    async fetchProfiles() {
      const { profilesFn } = this.gitConfig();
      await this.gitUpdateClone();
      const readStream = createReadStream(profilesFn);
      return this.parseCSV(readStream);
    }

    async writeProfiles(profiles) {
      const { profilesFn } = this.gitConfig();
      const out = profiles.map((row) => row.join(",")).join("\n");
      await fs.writeFile(profilesFn, out);
      return this.gitPush();
    }
  
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
      let { selectionHistory = [] } = await this.loadJSON(dataName);
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
      await this.updateJSON(dataName, {
        selectionHistory: [
          ...selection.map((profile) => profile.address),
          ...selectionHistory,
        ],
      });

      return selection;
    }
  };