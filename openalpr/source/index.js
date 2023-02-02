var express = require('express');
const app = express();

const callback = require('amqplib/callback_api');

const minioURL = 'minio';
var minio = require('minio');
const minioPort = 9000;
const minioUser = "minio-root-user";
const minioPassword = "minio-root-password";
const storageBucket = "makonskaitlosana";

var minioClient = new minio.Client(
    { 
    endPoint: minioURL,
    port: minioPort,
    useSSL: false,
    accessKey: minioUser,
    secretKey: minioPassword
    }
);


const mailURL = 'mailhog:1025';
var nodemailer = require('nodemailer');
const mailPort = 1025;

var mailer = nodemailer.createTransport({
    host: mailURL,
    port: mailPort,
    secure: false,
    auth: {
        user: "test@test.lv",
        pass: "test",
    },
});
const mysql = require('mysql2');
const mysqlURL =  'db';
const database = mysql.createConnection({
  host: mysqlURL,
  user: 'root',
  password: 'password',
  database: 'test'
});
var createTableQuery = `DROP TABLE IF EXISTS emails`;
database.query(
    createTableQuery,
    function(err, results, fields) {
        if (err) throw err;
    }
);
var createTableQuery = `DROP TABLE IF EXISTS cars`;
database.query(
    createTableQuery,
    function(err, results, fields) {
        if (err) throw err;
    }
);
var createTableQuery = `CREATE TABLE emails (
    id int AUTO_INCREMENT KEY,
    email varchar(255),
    reg_number varchar(255)
);`;
database.query(
    createTableQuery,
    function(err, results, fields) {
        if (err) throw err;
    }
);
var createTableQuery = `CREATE TABLE cars (
    id int AUTO_INCREMENT KEY,
    reg_number varchar(255),
    created_at DATETIME
);`;
database.query(
    createTableQuery,
    function(err, results, fields) {
        if (err) throw err;
    }
);
var plates = [];
plates.push('KL-5931','LG-7301','NG-3258','VG-8494');
plates.forEach(plate => {
    var email = plate.concat('@test.com');
    var insertQuery = `INSERT INTO emails (reg_number, email) 
                        VALUES ('${plate}', '${email}')`;
    database.query(
        insertQuery,
        function(err, results, fields) {
            if (err) throw err;
        }
    );    
});


app.get('/list', (req, res) => 
    {
        var listQuery = 'SELECT * FROM `cars`';
        database.query(
            listQuery,
            function(err, results, fields) {
                if (err) throw err;
                return JSON.stringify(results);
            }
        );
    }
);

const rabbitURL = 'amqp://rabbitmq';
const rabbitMqQueue = 'car-plates';

callback.connect(rabbitURL, function(error0, connection) 
    {
        if (error0){
            throw error0;
        } 
        connection.createChannel(function(error1, channel) 
            {
                if (error1){
                    throw error1;
                }
                channel.assertQueue(rabbitMqQueue, {durable: true});
                channel.consume(rabbitMqQueue, function(msg) 
                    {
                        var json_data = JSON.parse(msg.content);
                        processRequest(json_data.fileName, json_data.isLeaving);
                    }, 
                    {
                        noAck: true
                    }
                );
            }
        );
    }
);
function getEmailFromRegistration(regNumber)
{
    var selectQuery = `SELECT * FROM emails 
    WHERE reg_number ${regNumber}
    LIMIT 1`;
    database.query(
    selectQuery,
    function(err, results, fields) {
            if (err) throw err;
            row = JSON.stringify(results)[0];
            return row.email;
        }
    );
}
function sendEmail(row)
{
    var timeDelta = new Date().getTime() - new Date(row[0].created_at).getTime();
    var carOwner = getEmailFromRegistration(row[0].reg_number);
    timeDelta = timeDelta/60000;
    var mail = {
        from: 'sender@test.com',
        to: carOwner,
        subject: 'Parking time',
        text: `Your car ${row[0].reg_number} was parked for ${timeDelta} minutes`,
    };

    mailer.sendMail(mail, function(error, info)
        {
            if (error) {
                console.log(error);
            } else {
                console.log('Email sent: ' + info.response);
            }
        }
    );
}
function processRequest(fileName, isLeaving)
{
    minioClient.fGetObject(storageBucket, fileName, '/tmp/photo.jpg', function(error0) 
        {
            if (error0){
                throw error0;
            } 
            const exec = require('child_process').exec;
            exec('alpr -j /tmp/photo.jpg',function(error1, stdout, stderr)
                {
                    if(error1){
                        throw error1;
                    }
                    var reg_number = JSON.parse(stdout.toString())[0].reg_number;
                    if (isLeaving){
                        var selectQuery = `SELECT * FROM cars 
                                                    WHERE reg_number ${reg_number}
                                                    ORDER BY created_at DESC 
                                                    LIMIT 1`;
                        database.query(
                            selectQuery,
                            function(err, results, fields) {
                                if (err) throw err;
                                sendEmail(JSON.stringify(results));
                            }
                        );
                    }
                    else
                    {
                        var insertQuery = `INSERT INTO cars (reg_number, created_at) 
                                            VALUES (${reg_number}, ${new Date().toLocaleString([['sv-SE']])})`;
                        database.query(
                            insertQuery,
                            function(err, results, fields) {
                                if (err) throw err;
                            }
                        );
                    }
                }
            )
            console.log('success')
        }
    )
}


app.listen(3000, () => {
    console.log('alpr is running')
});