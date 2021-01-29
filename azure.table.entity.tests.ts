import * as assert from "assert";
import * as Azure from "azure-storage";

import fs from "fs";
import {
  getUniqueName,
  overrideRequest,
  restoreBuildRequestOptions,
} from "./testutils";

const config = readConfig();
/**
 * Reads the configurations.
 * @ignore
 *
 * @return {Object}
 */
function readConfig() {
  return JSON.parse(fs.readFileSync("local_settings.json", "utf8"));
}

class testEntity {
  PartitionKey: Azure.TableUtilities.entityGenerator.EntityProperty<string>;
  RowKey: Azure.TableUtilities.entityGenerator.EntityProperty<string>;
  myValue: Azure.TableUtilities.entityGenerator.EntityProperty<string>;
  constructor(part: string, row: string, value: string) {
    this.PartitionKey = eg.String(part);
    this.RowKey = eg.String(row);
    this.myValue = eg.String(value);
  }
}

// Create Entity for tests
function createBasicEntityForTest(): testEntity {
  return new testEntity("part1", getUniqueName("row"), "value1");
}

// const wildCardEtag = {
//   ".metadata": {
//     etag: "*" // forcing unconditional etag match to delete
//   }
// };

const eg = Azure.TableUtilities.entityGenerator;

describe("table Entity APIs test", () => {
  // const connectionString =
  //   `DefaultEndpointsProtocol=${protocol};AccountName=${accountName};` +
  //   `AccountKey=${sharedKey};TableEndpoint=${protocol}://${host}:${port}/${accountName};`;

  const connectionString = config.azureStorageConnectionString;

  const tableService = Azure.createTableService(connectionString);

  let tableName: string = getUniqueName("table");

  const requestOverride = { headers: {} };

  before(async () => {
    overrideRequest(requestOverride, tableService);
    tableName = "TestingAzurite"; // getUniqueName("table");
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata",
    };

    tableService.createTable(tableName, (error, result, response) => {
      // created table for tests
    });
  });

  after(async () => {
    restoreBuildRequestOptions(tableService);
  });

  it.only("Simple batch test: Inserts multiple entities as a batch, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata",
    };
    const batchEntity1 = createBasicEntityForTest();
    const batchEntity2 = createBasicEntityForTest();
    const batchEntity3 = createBasicEntityForTest();

    const entityBatch: Azure.TableBatch = new Azure.TableBatch();
    entityBatch.addOperation("INSERT", batchEntity1, { echoContent: true });
    entityBatch.addOperation("INSERT", batchEntity2, { echoContent: true });
    entityBatch.addOperation("INSERT", batchEntity3, { echoContent: true });

    tableService.executeBatch(
      tableName,
      entityBatch,
      (updateError, updateResult, updateResponse) => {
        if (updateError) {
          assert.ifError(updateError);
          done();
        } else {
          assert.equal(updateResponse.statusCode, 202); // No content
          // TODO When QueryEntity is done - validate Entity Properties
          tableService.retrieveEntity<testEntity>(
            tableName,
            batchEntity1.PartitionKey._,
            batchEntity1.RowKey._,
            (error, result) => {
              const entity: testEntity = result;
              assert.equal(entity.myValue._, batchEntity1.myValue._);
              done();
            }
          );
        }
      }
    );
  });

  it("Simple batch test: Query non existing entity via a batch, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata",
    };
    const batchEntity1 = createBasicEntityForTest();

    // retrieve is the only operation in the batch
    const entityBatch: Azure.TableBatch = new Azure.TableBatch();
    entityBatch.retrieveEntity(
      batchEntity1.PartitionKey._,
      batchEntity1.RowKey._,
      { echoContent: true }
    );

    tableService.executeBatch(
      tableName,
      entityBatch,
      (updateError, updateResult, updateResponse) => {
        if (updateError) {
          assert.ifError(updateError);
          done();
        } else {
          assert.equal(updateResponse.statusCode, 202); // No content
          // TODO When QueryEntity is done - validate Entity Properties
          tableService.retrieveEntity(
            tableName,
            batchEntity1.PartitionKey._,
            batchEntity1.RowKey._,
            (error, result) => {
              if (error) {
                assert.ifError(error);
              } else if (result) {
                assert.equal(result, null);
              }
              done();
            }
          );
        }
      }
    );
  });

  it("Simple batch test: insert and Merge entity via a batch, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata",
    };
    const batchEntity1 = createBasicEntityForTest();

    // retrieve is the only operation in the batch
    const entityBatch: Azure.TableBatch = new Azure.TableBatch();
    entityBatch.addOperation("INSERT", batchEntity1, { echoContent: true });
    batchEntity1.myValue._ = "value2";
    entityBatch.mergeEntity(batchEntity1);

    tableService.executeBatch(
      tableName,
      entityBatch,
      (updateError, updateResult, updateResponse) => {
        if (updateError) {
          assert.ifError(updateError);
          done();
        } else {
          assert.equal(updateResponse.statusCode, 202); // No content
          // TODO When QueryEntity is done - validate Entity Properties
          tableService.retrieveEntity(
            tableName,
            batchEntity1.PartitionKey._,
            batchEntity1.RowKey._,
            (error, result) => {
              if (error) {
                assert.ifError(error);
              } else if (result) {
                assert.equal(result, null);
              }
              done();
            }
          );
        }
      }
    );
  });

  // ToDo: Batch Validation:
  // A change set is a group of one or more insert, update, or delete operations.
  // A batch is a container of operations, including one or more change sets and query operations.
  // The Table service supports a subset of the functionality defined by the OData specification:
  //  The Table service supports only a single change set within a batch. The change set can include
  // multiple insert, update, and delete operations. If a batch includes more than one change set,
  // the first change set will be processed by the service, and additional change sets will be rejected
  // with status code 400 (Bad Request).
  // Multiple operations against a single entity are not permitted within a change set.
  // Note that a query operation is not permitted within a batch that contains insert, update, or delete
  // operations; it must be submitted singly in the batch.
  // Operations within a change set are processed atomically; that is, all operations in the change set
  // either succeed or fail. Operations are processed in the order they are specified in the change set.
  // The Table service does not support linking operations in a change set.
  // The Table service supports a maximum of 100 operations in a change set.

  // Implementation help:
  // https://docs.microsoft.com/en-us/rest/api/storageservices/blob-batch
  // https://docs.microsoft.com/en-us/rest/api/storageservices/performing-entity-group-transactions

  // Step 1. create Table handler for "POST" to table service root with $batch option.
  // Step 2. Handle "De-Serialization of batch requests" via example from JS SDK
  // using shared module (to be available for blob)
  // https://github.com/Azure/azure-sdk-for-js/blob/master/sdk/tables/data-tables/src/TableBatch.ts

  // Step 3. Validate request conforms to table service batch restrictions
  // see : https://docs.microsoft.com/en-us/rest/api/storageservices/performing-entity-group-transactions

  // Step 4. For each transaction:
  //                 Execute entity transaction via Hanlder & Loki Table Metadata store
  //                 Store results
  // NOTE:
  /*
    1. A change set is a group of one or more insert, update, or delete operations.
    2. A batch is a container of operations, including one or more change sets and query operations.
    3. An individual request within the change set is identical to a request made when that operation
       is being called by itself.
    4. The Table service supports only a single change set within a batch. The change set can include
       multiple insert, update, and delete operations.
    5. If a batch includes more than one change set, the first change set will be processed by the
       service, and additional change sets will be rejected with status code 400 (Bad Request).
    6. Multiple operations against a single entity are not permitted within a change set.
    7. A query operation is not permitted within a batch that contains insert, update, or delete
       operations; it must be submitted singly in the batch.ded
    8. Operations within a change set are processed atomically; that i^s, all operations in the change
       set either succeed or fail. Operations are processed in the order they are specified in the change set.
    9. The Table service does not support linking operations in a change set.
    10. ded
  */

  // Step 5. Return results to caller
});
