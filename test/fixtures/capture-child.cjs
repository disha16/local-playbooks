const http=require('node:http');
const server=http.createServer((req,res)=>{res.statusCode=req.headers.authorization===`Bearer ${process.env.LOCAL_PLAYBOOKS_CAPTURE_TOKEN}`?200:403;res.end(JSON.stringify({status:'healthy'}));}).listen(Number(process.env.TEST_CAPTURE_PORT),'127.0.0.1');
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
