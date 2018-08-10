# Install docker and get rhe android image file
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo apt-key fingerprint 0EBFCD88
sudo add-apt-repository \
   "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
   $(lsb_release -cs) \
   stable"
sudo apt-get update
sudo apt-get install -y docker-ce
sudo service docker start
sudo adduser $USER docker
sudo docker pull spotpoc/vbox_android_vdi:latest
sudo docker run -d --privileged --name vbox_android spotpoc/vbox_android_vdi:latest
sudo docker cp vbox_android:/root/Nexus5.1.vdi $HOME/vbox/Nexus5.1.vdi
sudo docker stop vbox_android
sudo docker rm -f vbox_android
sudo docker rmi -f spotpoc/vbox_android_vdi:latest

#create android vm
VM='Nexus5.1'
mkdir -p "$HOME/VirtualBox/$VM"127.0.0.1
VBoxManage createvm --name $VM --ostype "Linux" --basefolder "$HOME/VirtualBox" --register
VBoxManage storagectl $VM --name "IDE Controller" --add ide --controller PIIX4 --bootable on
VBoxManage storageattach $VM --storagectl "IDE Controller" --port 0 --device 0 --type hdd --medium "$HOME/vbox/$VM.vdi"
VBoxManage modifyvm $VM --ioapic on --chipset ich9 --boot1 dvd --boot2 disk --boot3 none --boot4 none \
--memory 495 --vram 64 --nic1 nat --natpf1 adb,tcp,*,5555,*,5555 --macaddress1 auto --mouse ps2 --keyboard ps2 \
--vrde on --vrdeport 5902 --vrdeaddress 127.0.0.1 --vrdeauthtype null --vrdemulticon on --vrdereusecon on --vrdevideochannel on \
--vrdevideochannelquality 100 --usb on --usbehci on