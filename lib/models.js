export class Model {
  constructor(props = {}) {
    Object.assign(this, props);
  }

  key() {
    return this.key;
  }
}

export class ModelArray extends Array {
  static ChildClass = Model;

  constructor(...items) {
    super();
    const { ChildClass } = this.constructor;
    this.push(...items.map((item) => new ChildClass(item)));
  }

  findBy(toFind) {
    const { ChildClass } = this.constructor;
    const key = (
      toFind instanceof ChildClass ? toFind : new ChildClass(toFind)
    ).key();
    return this.find((item) => item.key() == key);
  }

  add(toAdd) {
    const key = toAdd.key();
    if (!this.some((item) => item.key() == key)) {
      this.push(toAdd);
    }
    return this;
  }

  remove(toRemove) {
    const key = toRemove.key();
    const idx = this.findIndex((item) => item.key() == key);
    if (idx !== -1) {
      this.splice(idx, 1);
    }
    return this;
  }
}
