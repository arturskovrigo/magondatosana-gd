var express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const _ = require('lodash');

const app = express();
app.use(fileUpload({
    createParentPath: true
}));
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(morgan('dev'));
const amqp = require('amqplib/callback_api');


const rabbitURL = 'amqp://rabbitmq';
const rabbitMqQueue = 'car-plates';

var minio = require('minio');

const minioPort = 9000;
const minioUser = "rootUser";
const minioPassword = "rootUser";
const storageBucket = "makonskaitlosana";
const minioURL = 'minio';

var minioClient = new minio.Client(
    { 
    endPoint: minioURL,
    port: minioPort,
    useSSL: false,
    accessKey: minioUser,
    secretKey: minioPassword
    }
);

minioClient.makeBucket(storageBucket,  function(err) 
    {
        if (err) return console.log(err);
        console.log('Bucket created successfully');
    }
);


function appendQueue(fileName, isLeaving)
{
    amqp.connect(rabbitURL, function(error0, connection) 
        {
            if (error0){
                throw error0;
            } 
            connection.createChannel(function(error1, channel) 
                {
                    if (error1) {
                        throw error1;
                    }
                    var data = {"fileName": fileName, "isLeaving": isLeaving};
                    var msg = JSON.stringify(data);
                    channel.assertQueue(rabbitMqQueue, {durable: true});
                    channel.sendToQueue(rabbitMqQueue, Buffer.from(msg));
                }
            );
        }
    );
}
function addToBucket(file)
{
    minioClient.bucketExists(storageBucket, function(err, exists){
        if (err) {
            return console.log(err)
          }
          if (exists) {
            minioClient.putObject(storageBucket, file.name, file, function(err, objInfo) {
                if(err) {
                    return console.log(err)
                }
            });
          }
    });
}
app.post('/in', async (req, res) => {
    try {
        if(!req.files) {
            res.send({
                status: false,
                message: 'No file uploaded'
            });
        } else {
            let image = req.files.image;
            
            addToBucket(image);
            appendQueue(image.name, false);

            res.send({
                status: true,
                message: 'File is uploaded',
                data: {
                    name: image.name,
                    mimetype: image.mimetype,
                    size: image.size
                }
            });
        }
    } catch (err) {
        console.log(err);
        res.status(500).send(err);
    }
    res.send("OK");
});

app.post('/out', async (req, res) => {
    try {
        if(!req.files) {
            res.send({
                status: false,
                message: 'No file uploaded'
            });
        } else {
            let image = req.files.image;
            addToBucket(image);
            appendQueue(image.name, true);
            res.send({
                status: true,
                message: 'File is uploaded',
                data: {
                    name: image.name,
                    mimetype: image.mimetype,
                    size: image.size
                }
            });
        }
    } catch (err) {
        console.log(err);
        res.status(500).send(err);
    }
    res.send("OK");
});
app.listen(3000, () => {
    console.log('app is running')
});