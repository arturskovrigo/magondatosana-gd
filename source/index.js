var express = require('express');
const app = express();

const callback = require('amqplib/callback_api');


const rabbitURL = 'rabbitmq:5672';
const rabbitMqQueue = 'car-plates';

var minio = require('minio');

const minioPort = 9000;
const minioUser = "minio-root-user";
const minioPassword = "minio-root-password";
const storageBucket = "makonskaitlosana";
const minioURL = 'amqp://minio:9000';

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


var multer = require('multer')
var multerMinIOStorage = require('multer-minio-storage')

var upload = multer(
    {
        storage: multerMinIOStorage(
            {
            minioClient: minioClient,
            bucket: storageBucket,
            metadata: function (req, file, cb) 
                {
                    cb(null, {fieldName: file.fieldname});
                },
            key: function (req, file, cb) 
                {
                    cb(null, Date.now().toString())
                }
            }
        )
    }
);

function appendQueue(fileName, isLeaving)
{
    callback.connect(rabbitURL, function(error, connection) 
        {
            if (error) throw error;
            connection.createChannel(function(error, channel) 
                {
                    if (error) throw error;
                    var data = {"fileName": fileName, "isLeaving": isLeaving};
                    var msg = JSON.stringify(data);
                    channel.assertQueue(rabbitMqQueue, {durable: true});
                    channel.sendToQueue(rabbitMqQueue, Buffer.from(msg));
                }
            );
        }
    );
}
app.post('/in', upload.single('file'), (req, res) => {
    appendQueue(req.file.objectName, false);
    res.send("OK");
});

app.post('/out', upload.single('file'), (req, res) => {
    appendQueue(req.file.objectName, true);
    res.send("OK");
});
app.listen(3000, () => {
    console.log('app is running')
});