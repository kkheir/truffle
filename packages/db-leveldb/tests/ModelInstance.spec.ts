// @ts-nocheck
import { expect, assert } from "chai";
import { Storage } from "../src/storage";

const os = require("os");

describe("Model Instance", () => {
  const testModelDirectory = `${__dirname}/models`;
  Storage.modelDirectory = testModelDirectory;
  const tmpDir = os.tmpdir();
  let databaseName = "truffledbTest";
  let databaseEngine = "memory";
  let databaseDirectory = tmpDir;

  let levelDB;
  let models: object;
  let Project;
  const justRequiredFields = {
    id: 1,
    requiredNoDefault: "test"
  };

  beforeEach(() => {
    const DB = Storage.createStorage(
      databaseEngine,
      databaseDirectory,
      databaseName
    );

    levelDB = DB.levelDB;
    models = DB.models;
    Project = models.Project;
  });
  afterEach(async () => {
    await levelDB.close();
  });

  it("supports default values on the model definition", () => {
    const project = Project.build();
    expect(project.name).to.equal("Default Value");
  });

  it("saves a record from an existing model instance", async () => {
    const { id } = justRequiredFields;
    await Project.create(justRequiredFields);

    const storedProject = await Project.get(id);

    const updatedName = "updated name";
    storedProject.name = updatedName;

    await storedProject.save();

    const updatedProject = await Project.get(id);

    expect(storedProject).to.eql(updatedProject);
    expect(updatedProject.name).to.equal(updatedName);
  });

  it("throws if validation fails", async () => {
    const id = 0;
    const project = await Project.build({ id });

    project.requiredNoDefault = "test"; // just a required field

    project.name = 10;

    assert.throws(
      () => {
        project.runValidationFunctions();
      },
      Error,
      /Validation/
    );
  });
  it("throws if init is called more than once", async () => {
    const project = await Project.build();

    assert.throws(
      () => {
        project.init();
      },
      Error,
      /init has already/
    );
  });
  it("throws if save is called without a db key property", async () => {
    const project = await Project.build();
    let error;
    try {
      await project.save();
    } catch (e) {
      error = e.message;
    }

    expect(error.indexOf("key property") > -1).to.equal(true);
  });
  it("throws if a required field is undefined or null", async () => {
    const id = 0;
    const project = await Project.build({ id });

    let error;
    try {
      await project.save();
    } catch (e) {
      error = e.message;
    }
    expect(error.indexOf("Missing required field") > -1).to.equal(true);
    error = "";

    project.requiredNoDefault = null;
    try {
      await project.save();
    } catch (e) {
      error = e.message;
    }
    expect(error.indexOf("Missing required field") > -1).to.equal(true);
    error = "";

    project.requiredNoDefault = {};
    try {
      await project.save();
    } catch (e) {
      error = e.message;
    }
    expect(error.indexOf("Missing required field") > -1).to.equal(false);
  });
  describe("hooks", () => {
    describe("beforeSave", () => {
      it("executes code before the save takes place", async () => {
        const project = await Project.build(justRequiredFields);
        const newName = "beforeSave";
        let beforeSave = false;
        project.beforeSave = () => {
          beforeSave = true;
          project.name = newName;
        };

        await project.save();

        const savedProject = await Project.get(project.id);

        expect(beforeSave).to.equal(true);
        expect(savedProject.name).to.equal(newName);
      });
      it("executes code after the save takes place", async () => {
        const project = await Project.build(justRequiredFields);
        const newName = "beforeSave";
        const oldName = project.name;
        let beforeSave = false;
        project.afterSave = () => {
          beforeSave = true;
          project.name = newName;
        };

        await project.save();

        const savedProject = await Project.get(project.id);

        expect(beforeSave).to.equal(true);
        expect(savedProject.name).to.equal(oldName);
      });
    });
  });
});
