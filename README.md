# azurite_entity_tests

Tests used against azurite and Azure service for ensuring parity

Some code copied from https://github.com/azure/azurite to help run tests.

Add Azure Storage connection string (I use one with a SAS) to a file called local_settings.json in the root.

```json
{
  "azureStorageConnectionString": "<SAS conenction string here>"
}
```
