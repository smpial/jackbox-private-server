const Y = require('yjs');
const awarenessProtocol = require('y-protocols/awareness');
const syncProtocol = require('y-protocols/sync');
const buffer = require('lib0/buffer');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');

const messageSync = 0;
const messageAwareness = 1;
const messageQueryAwareness = 3;

class TextMap {
    constructor(text, clientID){
        this.document = new Y.Doc();
        this.document.clientID = clientID;
        let textDefault = this.document.getText('default');
        let temp = (new Y.Doc()).getText();
        temp.insert(0, 'a');
        textDefault.insert(0, temp);
        let textEcast = this.document.getText('ecast');
        textEcast.insert(0, text);
        this.root = Y.encodeStateAsUpdate(this.document);
        this.awareness = new awarenessProtocol.Awareness(this.document);
        this.debugIgnore = true;
    }

    handleShutdown(){
        this.awareness.destroy();
        this.document.destroy();
    }

    handleTextMapUpdate(update){
        const data = buffer.fromBase64(update.msg);
        const encoder = encoding.createEncoder();
        const decoder = decoding.createDecoder(data);
        const messageType = decoding.readVarUint(decoder);
        switch(messageType){
            case messageAwareness:
                try{
                    awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this);
                }catch(e){
                    console.error('Error on awareness update', e);
                }
                break;
            case messageQueryAwareness:
                console.error('messageQueryAwareness is not supported');
                break;
            case messageSync:
                try{
                    syncProtocol.readSyncMessage(decoder, encoder, this.document, this);
                }catch(e){
                    console.error('Error reading sync message in Quill provider:', e);
                }
                break;
            default:
                console.error('unknown message type:', messageType);
                break;
        }
    }

    getRoot(){
        return buffer.toBase64(this.root);
    }

    getText(){
        let text = "", attributions = [], r = this.document.getText('ecast')._start;
        while (r !== null){
            if(!r.deleted && r.countable && r.content.constructor === Y.ContentString){
                text += r.content.str;
                attributions.push({
                    author: r.id.client,
                    text: r.content.str,
                    pc: null
                });
            }
            r = r.right;
        }
        return {text, attributions};
    }
}

module.exports = TextMap;
