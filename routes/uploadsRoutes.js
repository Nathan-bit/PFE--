const express = require('express');
const path = require('path');
const ejs = require('ejs');
const fs = require('fs');
const xlsx = require('xlsx');
const multer = require('multer');
const csvParser = require('csv-parser');
const bodyParser = require('body-parser');
const {sequelize,   enseignant,  etudiant ,getDataFromTable, getAllTablesAndStructure } = require('../model/model');
const unidecode = require('unidecode');
const connection = require ('../model/dbConfig')

const router = express.Router();

// Middleware
router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json());

// Initialize multer
const uploadFolder = 'Uploads';
const uploadFolderPath = path.join(__dirname,  '..', uploadFolder);
if (!fs.existsSync(uploadFolderPath)) {
    fs.mkdirSync(uploadFolderPath);
}
const upload = multer({ dest: uploadFolderPath });


let data=[]
let items=[]

router.get('/upload', (req, res) => {
  getAllTablesAndStructure()
    .then(tablesStructure => {
      // List of table names you want to exclude
      const excludedTables = ['userregistrations',];

      // Filter out the excluded table names
      const filteredTablesStructure = Object.fromEntries(
        Object.entries(tablesStructure).filter(([tableName]) => !excludedTables.includes(tableName))
      );

      items = filteredTablesStructure;
      console.log('items from upload : ', items);

      return res.render('uploads', { dt: data, items: filteredTablesStructure });
    })
    .catch(error => {
      console.error('Error:', error);
      res.status(500).send('Error occurred while fetching tables and their structures');
    });
});

 

/* router.get('/upload', (req, res) => {
  // Assuming you have a MySQL connection named 'connection' already established

  // Query MySQL for table names
  connection.query('SHOW TABLES', (err, results) => {
    if (err) {
      console.error('Error fetching table names:', err);
      return res.status(500).send('Error fetching table names');
    }

    const tables = {};

    // Function to get the structure for each table
    const getTableStructure = (tableName) => {
      return new Promise((resolve, reject) => {
        connection.query(`DESCRIBE ${tableName}`, (err, columns) => {
          if (err) {
            reject(err);
            return;
          }
          const columnNames = columns.map(column => column.Field);
          resolve(columnNames);
        });
      });
    };

    // Fetch table structures in parallel
    const tableStructurePromises = results.map(row => {
      const tableName = row[`Tables_in_${connection.config.database}`];
      return getTableStructure(tableName).then(columns => {
        tables[tableName] = columns;
      });
    });

    Promise.all(tableStructurePromises)
      .then(() => {
        items=tables

        return res.render('uploads', {dt:data, items: items });
      })
      .catch(err => {
        console.error('Error fetching table structures:', err);
        res.status(500).send('Error fetching table structures');
      });
  });
}); */

router.post('/upload', upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).send('No file uploaded.');
    }

    // Check file type synchronously
    const fileType = path.extname(file.originalname).toLowerCase();
    if (fileType !== '.xlsx' && fileType !== '.csv') {
        return res.status(400).send('Unsupported file format. Please upload an Excel file (xlsx) or CSV file.');
    }

    try {
        // Read and process file asynchronously
        if (fileType === '.xlsx') {
            // Read Excel file
            const workbook = await xlsx.readFile(file.path);
            // Convert first sheet to JSON
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            let excelData = xlsx.utils.sheet_to_json(worksheet);
            // Apply unidecode to keys
            excelData = excelData.map((row) => {
                const transformedRow = {};
                for (const key in row) {
                    if (row.hasOwnProperty(key)) {
                        const newKey = unidecode(key).replace(/[^\w\s]/gi, ''); // Remove special characters and convert accented characters
                        transformedRow[newKey] = row[key];
                    }
                }
                data=transformedRow
                return transformedRow;
            });
           // res.render('uploads', {dt:data, items: items });
            return res.render('uploads', { dt: excelData , items : items });
           
        } else if (fileType === '.csv') {
            // Read CSV file asynchronously
            const csvData = [];
            fs.createReadStream(file.path, { encoding: 'latin1' })
                .pipe(csvParser())
                .on('data', (row) => {
                    const transformedRow = {};
                    for (const key in row) {
                        if (row.hasOwnProperty(key)) {
                            const newKey = unidecode(key).replace(/[^\w\s]/gi, ''); // Remove special characters and convert accented characters
                            transformedRow[newKey] = row[key];
                        }
                    }
                    csvData.push(transformedRow);
                    data=csvData
                })
                .on('end', () => {
                 // res.render('uploads', {dt:data, items: items });
                  return res.render('uploads', { dt: csvData ,items: items });
                })
                .on('error', (err) => {
                    console.error('Error:', err);
                    return res.status(500).send('Error while processing file.');
                });
        }
    } catch (err) {
        console.error('Error:', err);
        return res.status(500).send('Error while processing file.');
    }
});



router.post('/saveToDatabase', async (req, res) => {
  const { Data, Options, TableName } = req.body;

  //console.log(Data, Options, TableName);

  try {
    // Check if TableName is missing
    if (!TableName) {
      res.status(400).json({ error: 'Table name is required.' });
      return;
    }

    // Check if Options is missing or invalid
    if (Options !== '1' && Options !== '2') {
      res.status(400).json({ error: 'Invalid Options value. Use 1 or 2.' });
      return;
    }

    // Get the model for the specified table
    const Model = sequelize.models[TableName];

    if (!Model) {
      res.status(404).json({ error: `Table "${TableName}" not found.` });
      return;
    }

    // Handle data insertion based on the specified options
    if (Options === '1') {
      // Insert new data only
      const transaction = await sequelize.transaction();
    
      try {
        const result = await Model.bulkCreate(Data, {
          transaction,
          ignoreDuplicates: true, // Ignore duplicate entry errors
        });
    
        console.log(`${result.length} rows inserted successfully.`);
        await transaction.commit();
        res.status(200).json({ message: 'Data inserted successfully.' });
      } catch (error) {
        // Handle other errors, if any
        await transaction.rollback();
        console.error('Error inserting data:', error);
        res.status(500).json({ error: 'Internal server error. Failed to insert data.' });
      }
    } else if (Options === '2') {
      // Insert new data and update existing data
      const transaction = await sequelize.transaction();
    
      try {
        await Promise.all(
          Data.map(async (item) => {
            const [result, created] = await Model.findOrCreate({
              where: { EMAIL: item.EMAIL }, // Use the unique key condition here
              defaults: item,
              transaction,
            });
    
            if (!created) {
              await result.update(item, { transaction });
            }
          })
        );
    
        await transaction.commit();
        res.status(200).json({ message: 'Data inserted and updated successfully.' });
      } catch (error) {
        await transaction.rollback();
        console.error('Error inserting/updating data:', error);
        res.status(500).json({ error: 'Internal server error. Failed to insert/update data.' });
      }
    }
  } catch (error) {
    console.error('Error saving data to database:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});
/*  router.post('/saveToDatabase', async (req, res) => {
  const { Data, Options, TableName } = req.body;
  let d = Data;

  try {
    // Check if TableName is missing
    if (!TableName) {
      res.status(400).json({ error: 'Table name is required.' });
      return;
    }

    // Check if Options is missing or invalid
    if (Options !== '1' && Options !== '2') {
      res.status(400).json({ error: 'Invalid Options value. Use 1 or 2.' });
      return;
    }

    // Handle data insertion based on the specified options
    if (Options === '1') {
      // Insert new data only
      for (const item of d) {
        try {
          const query = 'INSERT INTO ?? SET ?';
          await connection.query(query, [TableName, item]);
        } catch (error) {
          // Log error for debugging
          console.error('Error inserting data:', error);
          // Send appropriate error response to client
          res.status(500).json({ error: 'Internal server error. Failed to insert data.' });
          return;
        }
      }
      // Send success response to client
      res.status(200).json({ message: 'Data inserted successfully.' });
    } else if (Options === '2') {
      // Insert new data and update existing data
      for (const item of d) {
        const query = 'INSERT INTO ?? SET ? ON DUPLICATE KEY UPDATE ?';
        try {
          await connection.query(query, [TableName, item, item]);
        } catch (error) {
          // Log error for debugging
          console.error('Error inserting/updating data:', error);
          // Send appropriate error response to client
          res.status(500).json({ error: 'Internal server error. Failed to insert/update data.' });
          return;
        }
      }
      // Send success response to client
      res.status(200).json({ message: 'Data inserted and updated successfully.' });
    }
  } catch (error) {
    // Log error for debugging
    console.error('Error saving data to database:', error);
    // Send appropriate error response to client
    res.status(500).json({ error: 'Internal server error.' });
  }
}); 
 */



/* router.post('/saveToDatabase', async (req, res) => {
  const { Data, Options, TableName } = req.body;

  let d = Data;

  try {
    // Check if TableName is missing
    if (!TableName) {
      res.status(400).json({ error: 'Table name is required.' });
      return;
    }

    // Check if Options is missing or invalid
    if (Options !== '1' && Options !== '2') {
      res.status(400).json({ error: 'Invalid Options value. Use 1 or 2.' });
      return;
    }

    // Get the column names of the target table
    let tableColumns;
    try {
      const [tableInfo] = await connection.query(`SHOW COLUMNS FROM ${TableName}`);
      tableColumns = tableInfo.map(info => info.Field);
    } catch (error) {
      console.error('Error retrieving table columns:', error);
      res.status(500).json({ error: 'Internal server error. Failed to retrieve table columns.' });
      return;
    }

    // Handle data insertion based on the specified options
    if (Options === '1') {
      // Insert new data only
      for (const item of d) {
        try {
          const filteredItem = filterDataByTableColumns(item, tableColumns);
          const columns = Object.keys(filteredItem);
          const query = `INSERT INTO ${TableName} (${columns.map(() => '??').join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
          await connection.query(query, [...columns, ...columns.map(key => filteredItem[key])]);
        } catch (error) {
          // Log error for debugging
          console.error('Error inserting data:', error);

          // Send appropriate error response to client
          res.status(500).json({ error: 'Internal server error. Failed to insert data.' });
          return;
        }
      }
      // Send success response to client
      res.status(200).json({ message: 'Data inserted successfully.' });
    } else if (Options === '2') {
      // Insert new data and update existing data
      for (const item of d) {
        const filteredItem = filterDataByTableColumns(item, tableColumns);
        const columns = Object.keys(filteredItem);
        const query = `INSERT INTO ${TableName} (${columns.map(() => '??').join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${columns.map(key => `?? = ?`).join(', ')}`;
        try {
          await connection.query(query, [...columns, ...columns.map(key => filteredItem[key]), ...columns.map(key => key), ...columns.map(key => filteredItem[key])]);
        } catch (error) {
          // Log error for debugging
          console.error('Error inserting/updating data:', error);

          // Send appropriate error response to client
          res.status(500).json({ error: 'Internal server error. Failed to insert/update data.' });
          return;
        }
      }
      // Send success response to client
      res.status(200).json({ message: 'Data inserted and updated successfully.' });
    }
  } catch (error) {
    // Log error for debugging
    console.error('Error saving data to database:', error);

    // Send appropriate error response to client
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Helper function to filter out keys not present in the table columns
function filterDataByTableColumns(data, tableColumns) {
  const filteredData = {};
  for (const key of Object.keys(data)) {
    if (tableColumns.includes(key)) {
      filteredData[key] = data[key];
    }
  }
  return filteredData;
}
 */
  router.get('/upload', (req, res) => { 
    console.log('items from uploads', items)
    res.render('uploads',{dt : data, items:items });
});



module.exports = router;
