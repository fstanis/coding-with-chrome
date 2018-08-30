import aiy.assistant.grpc
import aiy.audio
import aiy.voicehat
 
def main():
    status_ui = aiy.voicehat.get_status_ui()
    status_ui.status('starting')
    assistant = aiy.assistant.grpc.get_assistant()
    button = aiy.voicehat.get_button()
    with aiy.audio.get_recorder():
        status_ui.status('ready')
        print('Press the button and speak')
        button.wait_for_press()
        status_ui.status('listening')
        print('Listening...')
        text, _ = assistant.recognize()
        if text:
            print('You said "', text, '"')
 
if __name__ == '__main__':
    main()
